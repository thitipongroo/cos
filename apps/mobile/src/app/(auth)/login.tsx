// Login screen — phone number entry + OTP verification.
// Auth logic is in authStore (P0-F3).

import { View, Text, StyleSheet } from 'react-native';

export default function LoginScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Construction OS</Text>
      {/* Phone + OTP flow implemented in P0-F3 authStore */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold' },
});
