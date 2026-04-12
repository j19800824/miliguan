'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function SkuImageUploader({
  productId,
  skuId,
  canEdit
}: {
  productId: string;
  skuId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSelectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setLoading(true);
    const response = await fetch(`/api/admin/products/${productId}/skus/${skuId}/image`, {
      method: 'POST',
      body: formData
    });
    setLoading(false);
    event.target.value = '';

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '上传 SKU 图片失败' }));
      toast.error(error.message ?? '上传 SKU 图片失败');
      return;
    }

    const body = await response.json().catch(() => ({ message: 'SKU 图片变更申请已提交' }));
    toast.success(body.message ?? 'SKU 图片变更申请已提交');
    router.refresh();
  }

  return (
    <>
      <input
        ref={inputRef}
        type='file'
        accept='image/png,image/jpeg,image/webp'
        className='hidden'
        onChange={onSelectFile}
      />
      <Button
        variant='secondary'
        size='sm'
        disabled={!canEdit || loading}
        onClick={() => inputRef.current?.click()}
      >
        {loading ? '上传中...' : '上传图片'}
      </Button>
    </>
  );
}
