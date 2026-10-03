import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

function journalPhotoDirectory() {
  const directory = new Directory(Paths.document, 'journal-photos');
  if (!directory.exists) directory.create();
  return directory;
}

export function journalPhotoUri(name: string) {
  return new File(Paths.document, 'journal-photos', name).uri;
}

export async function saveJournalPhoto(sourceUri: string) {
  const source = new File(sourceUri);
  const name = `${randomUUID()}${source.extension || '.jpg'}`;
  await source.copy(new File(journalPhotoDirectory(), name));
  return name;
}

export function deleteJournalPhoto(name: string) {
  const file = new File(Paths.document, 'journal-photos', name);
  if (file.exists) file.delete();
}
