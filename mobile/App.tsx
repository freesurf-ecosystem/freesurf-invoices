import * as Sentry from "@sentry/react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

Sentry.init({
  dsn: "https://2681c17429bc51f4bf11e6939f827279@o4511383545184256.ingest.us.sentry.io/4511383549575168",
  tracesSampleRate: 0.2,
  environment: __DEV__ ? "development" : "production",
  enabled: !__DEV__,
});
import { SafeAreaProvider } from "react-native-safe-area-context";
import AuthScreen from "./screens/AuthScreen";
import DraftsScreen from "./screens/DraftsScreen";
import CreateInvoiceScreen from "./screens/CreateInvoiceScreen";
import InvoicesScreen from "./screens/InvoicesScreen";
import { supabase } from "./lib/supabase";

export type RootStackParamList = {
  CreateInvoice: { draftId?: string; draftPayload?: Record<string, unknown>; invoiceId?: string } | undefined;
  Drafts: undefined;
  Invoices: undefined;
  Auth: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function App() {
  const [session, setSession] = useState<boolean | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(Boolean(data.session));
      setInitialized(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(Boolean(s));
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!initialized) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f4f1ea" }}>
        <ActivityIndicator color="#0d6b61" />
      </View>
    );
  }

  // No auth gate — app works fully without login. Sign in is optional for cloud sync.
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="CreateInvoice"
          screenOptions={{
            headerStyle: { backgroundColor: "#f4f1ea" },
            headerTintColor: "#0d6b61",
            headerTitleStyle: { fontWeight: "700" },
          }}
        >
          <Stack.Screen
            name="CreateInvoice"
            options={{ headerShown: false }}
          >
              {(props) => {
                const params = props.route.params;
                return (
                  <CreateInvoiceScreen
                    isLoggedIn={Boolean(session)}
                    onSignIn={() => props.navigation.navigate("Auth")}
                    onSignOut={() => setSession(false)}
                    onViewDrafts={() => props.navigation.navigate("Drafts")}
                    onViewInvoices={() => props.navigation.navigate("Invoices")}
                    loadDraftId={params?.draftId}
                    loadDraftPayload={params?.draftPayload}
                    loadInvoiceId={params?.invoiceId}
                  />
                );
              }}
          </Stack.Screen>
          <Stack.Screen
            name="Drafts"
            options={{ headerShown: false }}
          >
              {(props) => (
                <DraftsScreen
                  onOpenDraft={(draft) => props.navigation.navigate("CreateInvoice", { draftId: draft.id, draftPayload: draft.payload_json })}
                  onNewInvoice={() => props.navigation.navigate("CreateInvoice")}
                  onViewInvoices={() => props.navigation.navigate("Invoices")}
                  onSignIn={() => props.navigation.navigate("Auth")}
                  onSignOut={() => setSession(false)}
                  isLoggedIn={Boolean(session)}
                />
              )}
          </Stack.Screen>
          <Stack.Screen
            name="Invoices"
            options={{ headerShown: false }}
          >
              {(props) => (
                <InvoicesScreen
                  onNewInvoice={() => props.navigation.navigate("CreateInvoice")}
                  onDrafts={() => props.navigation.navigate("Drafts")}
                  onSignIn={() => props.navigation.navigate("Auth")}
                  onSignOut={() => setSession(false)}
                  isLoggedIn={Boolean(session)}
                  onEditInvoice={(id) => props.navigation.navigate("CreateInvoice", { invoiceId: id })}
                />
              )}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(App);
