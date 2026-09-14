import { createRoute } from '@granite-js/react-native';
import React from 'react';
import { HomeScreen } from '../screens/HomeScreen';

export const Route = createRoute('/', {
  component: HomePage,
});

function HomePage() {
  const navigation = Route.useNavigation();
  return <HomeScreen onOpenAbout={() => navigation.navigate('/about')} />;
}
