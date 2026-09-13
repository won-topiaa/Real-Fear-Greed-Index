import { createRoute } from '@granite-js/react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export const Route = createRoute('/', {
  component: HomePage,
});

function HomePage() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>실질 공포탐욕지수</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#191F28' },
});
