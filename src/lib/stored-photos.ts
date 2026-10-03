import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

type PhotoFolder = 'receipt-photos' | 'task-photos';

export function storedPhotoUri(folder: PhotoFolder, name: string) {
  return new File(Paths.document, folder, name).uri;
}

export function storePhoto(folder: PhotoFolder, sourceUri: string) {
  const directory = new Directory(Paths.document, folder);
  if (!directory.exists) directory.create();
  const source = new File(sourceUri);
  const name = `${randomUUID()}${source.extension || '.jpg'}`;
  source.copy(new File(directory, name));
  return name;
}

export function removeStoredPhoto(folder: PhotoFolder, name: string) {
  const file = new File(Paths.document, folder, name);
  if (file.exists) file.delete();
}
