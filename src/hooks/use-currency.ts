import { DEFAULT_CURRENCY, isCurrencyCode } from '../constants/currencies';
import { useAuth } from '../providers/auth-provider';

export function useCurrency() {
  const value = useAuth().session?.user.user_metadata?.currency;
  return typeof value === 'string' && isCurrencyCode(value) ? value : DEFAULT_CURRENCY;
}
