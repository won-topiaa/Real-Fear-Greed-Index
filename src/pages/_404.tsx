import { createRoute } from '@granite-js/react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * granite 라우터는 화면 목록에서 `/_404`를 못 찾으면 첫 렌더에서 예외를 던진다.
 * 이 파일이 없으면 앱이 흰 화면("잠시 문제가 생겼어요")으로 죽는다. 절대 지우지 말 것.
 */
export const Route = createRoute('/_404', {
  component: NotFoundPage,
});

function NotFoundPage() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>페이지를 찾을 수 없어요</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  title: { fontSize: 16, color: '#4E5968' },
});
