import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Upload, Trash2, FileText, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Article {
  id: string;
  title: string;
  filename: string;
  status: string;
  chunk_count: number;
  error_message: string | null;
  created_at: string;
}

export function ArticleManagement() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [articleToDelete, setArticleToDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchArticles();
    
    // Subscribe to realtime updates for article status changes
    const channel = supabase
      .channel('article-status-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scientific_articles',
        },
        (payload) => {
          setArticles(prev => prev.map(a => 
            a.id === payload.new.id ? { ...a, ...payload.new } : a
          ));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchArticles = async () => {
    try {
      const { data, error } = await supabase
        .from('scientific_articles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setArticles(data || []);
    } catch (error) {
      console.error('Error fetching articles:', error);
      toast.error('Failed to load articles');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['application/pdf', 'text/plain', 'text/markdown'];
      if (!validTypes.includes(file.type) && !file.name.endsWith('.md')) {
        toast.error('Please upload a PDF, TXT, or MD file');
        return;
      }
      setSelectedFile(file);
      if (!title) {
        // Auto-fill title from filename
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !title.trim()) {
      toast.error('Please provide a title and select a file');
      return;
    }

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Generate unique file path
      const fileExt = selectedFile.name.split('.').pop();
      const filePath = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('scientific-articles')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Create article record
      const { data: article, error: insertError } = await supabase
        .from('scientific_articles')
        .insert({
          title: title.trim(),
          filename: selectedFile.name,
          file_path: filePath,
          uploaded_by: user.id,
          status: 'processing',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast.success('Article uploaded! Processing will begin shortly.');

      // Trigger processing
      const { error: processError } = await supabase.functions.invoke('process-article', {
        body: { article_id: article.id },
      });

      if (processError) {
        console.error('Error triggering processing:', processError);
        toast.error('Article uploaded but processing failed to start');
      }

      // Reset form
      setTitle('');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Refresh articles list
      fetchArticles();

    } catch (error: any) {
      console.error('Error uploading article:', error);
      toast.error(error.message || 'Failed to upload article');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!articleToDelete) return;

    try {
      const article = articles.find(a => a.id === articleToDelete);
      
      // Delete from storage
      if (article) {
        await supabase.storage
          .from('scientific-articles')
          .remove([article.filename]);
      }

      // Delete record (will cascade delete embeddings)
      const { error } = await supabase
        .from('scientific_articles')
        .delete()
        .eq('id', articleToDelete);

      if (error) throw error;

      toast.success('Article deleted successfully');
      setArticles(prev => prev.filter(a => a.id !== articleToDelete));

    } catch (error: any) {
      console.error('Error deleting article:', error);
      toast.error(error.message || 'Failed to delete article');
    } finally {
      setDeleteDialogOpen(false);
      setArticleToDelete(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'processing':
        return <Clock className="h-4 w-4 text-yellow-500 animate-pulse" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusText = (article: Article) => {
    switch (article.status) {
      case 'ready':
        return `${article.chunk_count} chunks embedded`;
      case 'processing':
        return 'Processing...';
      case 'error':
        return article.error_message || 'Processing failed';
      default:
        return article.status;
    }
  };

  if (loading) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Scientific Articles</CardTitle>
          <p className="text-sm text-muted-foreground">
            Upload research articles to enhance AI insights with evidence-based recommendations
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Upload Form */}
          <div className="space-y-4 p-4 border border-dashed rounded-xl">
            <div className="space-y-2">
              <Label>Article Title</Label>
              <Input
                placeholder="e.g., Sensory Processing in Children"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label>PDF or Text File</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                onChange={handleFileChange}
                className="rounded-xl"
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            <Button
              onClick={handleUpload}
              disabled={uploading || !selectedFile || !title.trim()}
              className="w-full rounded-xl"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Article
                </>
              )}
            </Button>
          </div>

          {/* Articles List */}
          {articles.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No articles uploaded yet. Upload your first research article above.
            </p>
          ) : (
            <div className="space-y-3">
              <Label>Uploaded Articles ({articles.length})</Label>
              {articles.map((article) => (
                <div
                  key={article.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-xl"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {getStatusIcon(article.status)}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{article.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {getStatusText(article)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setArticleToDelete(article.id);
                      setDeleteDialogOpen(true);
                    }}
                    className="h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Article?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this article and all its embeddings. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
