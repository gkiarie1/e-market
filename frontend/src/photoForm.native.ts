import { File } from 'expo-file-system';

// Expo SDK 58 fetch requires a Blob/File with readable bytes, not the legacy
// React Native { uri, name, type } object. File reads image-picker cache URIs.
export async function createPhotoForm(uri: string): Promise<FormData> {
  const photo = new File(uri);
  if (!photo.exists) throw new Error('This photo is no longer available. Please choose or take it again.');
  if (photo.size > 8 * 1024 * 1024) throw new Error('Photo must be smaller than 8 MB. Please choose a smaller image.');
  const form = new FormData();
  form.append('file', photo);
  return form;
}
