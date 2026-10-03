import { removeStoredPhoto, storedPhotoUri, storePhoto } from './stored-photos';

export function receiptPhotoUri(name: string) {
  return storedPhotoUri('receipt-photos', name);
}

export function saveReceiptPhoto(sourceUri: string) {
  return storePhoto('receipt-photos', sourceUri);
}

export function deleteReceiptPhoto(name: string) {
  removeStoredPhoto('receipt-photos', name);
}
