import * as ImagePicker from 'expo-image-picker';
import { getApiClient, shouldUseMocks } from './api/client';

export interface SignResponse {
  ok: boolean;
  uploadUrl: string;
  finalUrl: string;
  key: string;
  contentType: string;
}

interface SignArgs {
  filename: string;
  contentType: string;
  scope: 'avatar' | 'order' | 'misc';
}

async function getSignedUrl(args: SignArgs): Promise<SignResponse> {
  return getApiClient()<SignResponse>('/api/mobile/upload/sign', {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function pickAndUploadAvatar(): Promise<string | null> {
  if (shouldUseMocks()) {
    // Demo mode: return a placeholder URL so the UI flow works without OSS.
    return 'https://picsum.photos/seed/miliguan/200';
  }

  // 1. Permission
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new Error('需要相册访问权限');
  }

  // 2. Pick (square, compressed)
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const uri = asset.uri;
  const contentType = asset.mimeType ?? 'image/jpeg';
  const filename = uri.split('/').pop() ?? `avatar.jpg`;

  // 3. Get signed PUT URL
  const sign = await getSignedUrl({ filename, contentType, scope: 'avatar' });

  // 4. PUT the binary
  const blob = await fetch(uri).then((r) => r.blob());
  const putRes = await fetch(sign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!putRes.ok) {
    throw new Error(`上传失败 ${putRes.status}`);
  }

  // 5. Tell backend the new avatar URL
  await getApiClient()<{ ok: boolean }>('/api/mobile/me/avatar', {
    method: 'PUT',
    body: JSON.stringify({ avatarUrl: sign.finalUrl }),
  });

  return sign.finalUrl;
}
