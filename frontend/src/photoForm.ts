// Browser fallback. Metro selects photoForm.native.ts for Android and iOS.
export async function createPhotoForm(uri: string): Promise<FormData> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('This photo is no longer available. Please choose or take it again.');
  const photo = await response.blob();
  if (photo.size > 8 * 1024 * 1024) throw new Error('Photo must be smaller than 8 MB. Please choose a smaller image.');
  const form = new FormData();
  form.append('file', photo, 'produce.jpg');
  return form;
}
