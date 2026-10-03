import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

// Only the file name is stored in the database; the app folder path can change between installs.
function photoDirectory() {
  const directory = new Directory(Paths.document, 'meal-photos');
  if (!directory.exists) directory.create();
  return directory;
}

export function mealPhotoUri(name: string) {
  return new File(Paths.document, 'meal-photos', name).uri;
}

export async function saveMealPhoto(sourceUri: string) {
  const name = `${randomUUID()}.jpg`;
  await new File(sourceUri).copy(new File(photoDirectory(), name));
  return name;
}

export function deleteMealPhoto(name: string) {
  try {
    const file = new File(Paths.document, 'meal-photos', name);
    if (file.exists) file.delete();
  } catch {
    // A leftover photo file is harmless.
  }
}
