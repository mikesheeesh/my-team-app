import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export default function NotFoundScreen() {
  const router = useRouter();
  const url = Linking.useURL();

  useEffect(() => {
    // Μικρή καθυστέρηση για να προλάβει να διαβάσει το URL
    const timeout = setTimeout(() => {
        if (url) {
            // Ψάχνουμε για τον κωδικό μέσα στο "χαλασμένο" link
            // Είτε είναι ?code=... είτε ?inviteCode=...
            const { queryParams } = Linking.parse(url);
            
            const code = queryParams?.code || queryParams?.inviteCode;

            if (code) {
                // Αν βρήκαμε κωδικό, πάμε στο Join
                router.replace(`/join?code=${code}`);
            } else {
                // Αν δεν βρήκαμε τίποτα, πάμε στην αρχική
                router.replace('/dashboard'); 
            }
        } else {
            router.replace('/');
        }
    }, 100);

    return () => clearTimeout(timeout);
  }, [url]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#2563eb" />
      <Text style={styles.text}>Γίνεται σύνδεση...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  text: { marginTop: 20, fontSize: 16, color: '#666' },
});