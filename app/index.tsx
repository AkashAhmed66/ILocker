import SecurityService from '@/services/SecurityService';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

export default function Index() {
  const [isPasswordSet, setIsPasswordSet] = useState<boolean | null>(null);
  const isAuthenticated = SecurityService.isAuthenticated();

  useEffect(() => {
    SecurityService.isPasswordSet().then(setIsPasswordSet);
  }, []);

  if (isPasswordSet === null) {
    return null; // Loading
  }

  if (!isPasswordSet) {
    return <Redirect href="/set-password" />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return <Redirect href="/home" />;
}
