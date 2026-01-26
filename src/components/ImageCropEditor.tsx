import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Check, X, Move } from 'lucide-react';

interface ImageCropEditorProps {
  imageFile: File;
  open: boolean;
  onClose: () => void;
  onCropComplete: (croppedBlob: Blob) => void;
}

export function ImageCropEditor({ imageFile, open, onClose, onCropComplete }: ImageCropEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, size: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 300, height: 300 });
  const [scale, setScale] = useState(1);

  // Load image when file changes
  useEffect(() => {
    if (!imageFile) return;
    
    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);
    
    const img = new Image();
    img.onload = () => {
      setImage(img);
      
      // Calculate canvas size to fit in dialog (max 300px)
      const maxSize = 300;
      const imgScale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const scaledWidth = img.width * imgScale;
      const scaledHeight = img.height * imgScale;
      
      setCanvasSize({ width: scaledWidth, height: scaledHeight });
      setScale(imgScale);
      
      // Initialize crop box to center square
      const minDim = Math.min(scaledWidth, scaledHeight);
      const initialSize = minDim * 0.8;
      setCropBox({
        x: (scaledWidth - initialSize) / 2,
        y: (scaledHeight - initialSize) / 2,
        size: initialSize,
      });
    };
    img.src = url;
    
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear and draw image
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    ctx.drawImage(image, 0, 0, canvasSize.width, canvasSize.height);
    
    // Draw darkened overlay outside crop area
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
    
    // Clear the crop area to show original image
    ctx.clearRect(cropBox.x, cropBox.y, cropBox.size, cropBox.size);
    ctx.drawImage(
      image,
      cropBox.x / scale, cropBox.y / scale, cropBox.size / scale, cropBox.size / scale,
      cropBox.x, cropBox.y, cropBox.size, cropBox.size
    );
    
    // Draw crop border
    ctx.strokeStyle = 'hsl(var(--primary))';
    ctx.lineWidth = 2;
    ctx.strokeRect(cropBox.x, cropBox.y, cropBox.size, cropBox.size);
    
    // Draw corner handles
    const handleSize = 8;
    ctx.fillStyle = 'hsl(var(--primary))';
    // Top-left
    ctx.fillRect(cropBox.x - handleSize/2, cropBox.y - handleSize/2, handleSize, handleSize);
    // Top-right
    ctx.fillRect(cropBox.x + cropBox.size - handleSize/2, cropBox.y - handleSize/2, handleSize, handleSize);
    // Bottom-left
    ctx.fillRect(cropBox.x - handleSize/2, cropBox.y + cropBox.size - handleSize/2, handleSize, handleSize);
    // Bottom-right
    ctx.fillRect(cropBox.x + cropBox.size - handleSize/2, cropBox.y + cropBox.size - handleSize/2, handleSize, handleSize);
    
  }, [image, cropBox, canvasSize, scale]);

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(e);
    setIsDragging(true);
    setDragStart({ x: pos.x - cropBox.x, y: pos.y - cropBox.y });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    
    const pos = getMousePos(e);
    let newX = pos.x - dragStart.x;
    let newY = pos.y - dragStart.y;
    
    // Constrain to canvas bounds
    newX = Math.max(0, Math.min(newX, canvasSize.width - cropBox.size));
    newY = Math.max(0, Math.min(newY, canvasSize.height - cropBox.size));
    
    setCropBox(prev => ({ ...prev, x: newX, y: newY }));
  }, [isDragging, dragStart, canvasSize, cropBox.size]);

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleCrop = () => {
    if (!image) return;
    
    // Create output canvas at desired size (256x256 for avatar)
    const outputCanvas = document.createElement('canvas');
    const outputSize = 256;
    outputCanvas.width = outputSize;
    outputCanvas.height = outputSize;
    
    const ctx = outputCanvas.getContext('2d');
    if (!ctx) return;
    
    // Calculate source coordinates in original image
    const srcX = cropBox.x / scale;
    const srcY = cropBox.y / scale;
    const srcSize = cropBox.size / scale;
    
    // Draw cropped region to output canvas
    ctx.drawImage(
      image,
      srcX, srcY, srcSize, srcSize,
      0, 0, outputSize, outputSize
    );
    
    // Convert to blob and return
    outputCanvas.toBlob((blob) => {
      if (blob) {
        onCropComplete(blob);
      }
    }, 'image/jpeg', 0.9);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crop Photo</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col items-center gap-4 py-4">
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Move className="h-4 w-4" /> Drag to position the square
          </p>
          
          <div className="border rounded-lg overflow-hidden bg-muted">
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="cursor-move"
              style={{ touchAction: 'none' }}
            />
          </div>
        </div>
        
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl">
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleCrop} className="rounded-xl">
            <Check className="h-4 w-4 mr-2" />
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
