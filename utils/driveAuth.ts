/**
 * Google Drive OAuth Authentication
 *
 * Handles OAuth2 PKCE flow for Google Drive access.
 * Separate from the app's Google Sign-In (personal account).
 * The team admin/founder connects the team's Google account once,
 * then the refresh token is stored in Firestore for persistent access.
 */

import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

// Complete the auth session for web browser redirect
WebBrowser.maybeCompleteAuthSession();

// Web Client ID + Secret: used for auth, token exchange & refresh
const GOOGLE_WEB_CLIENT_ID =
  "1066934665062-58dao455r4etr1ublg2tthmrj89c8a1j.apps.googleusercontent.com";
const GOOGLE_WEB_CLIENT_SECRET = "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";

// HTTPS redirect registered with Google (Firebase Hosting page redirects to custom scheme)
const GOOGLE_REDIRECT_URI = "https://ergon-work.web.app/auth/callback";

// Custom scheme the callback page redirects to (Chrome Custom Tab intercepts this)
const APP_RETURN_URL = "ergonwork://oauthredirect";

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
};

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export interface DriveConfig {
  refreshToken: string;
  accessToken: string;
  tokenExpiry: number; // Unix ms
  connectedEmail: string;
  connectedAt: string;
  rootFolderId: string;
}

/**
 * Generate PKCE code verifier and challenge
 */
const generatePKCE = async () => {
  const codeVerifier = generateRandomString(64);
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  // Base64url encode
  const codeChallenge = digest
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { codeVerifier, codeChallenge };
};

const generateRandomString = (length: number): string => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let result = "";
  const randomValues = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    randomValues[i] = Math.floor(Math.random() * chars.length);
  }
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
};

/**
 * Connect Google Drive for a team
 * Opens OAuth consent screen via browser, callback page redirects to custom scheme
 */
export const connectGoogleDrive = async (
  teamId: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Generate PKCE values
    const { codeVerifier, codeChallenge } = await generatePKCE();
    const state = generateRandomString(32);

    // Build the authorization URL manually
    const authUrl =
      `${discovery.authorizationEndpoint}?` +
      `client_id=${encodeURIComponent(GOOGLE_WEB_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(`${DRIVE_SCOPE} email`)}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&code_challenge=${encodeURIComponent(codeChallenge)}` +
      `&code_challenge_method=S256` +
      `&state=${encodeURIComponent(state)}`;

    // Open browser - watch for custom scheme redirect (callback page redirects to this)
    const result = await WebBrowser.openAuthSessionAsync(
      authUrl,
      APP_RETURN_URL,
    );

    if (result.type !== "success" || !("url" in result)) {
      return {
        success: false,
        error: result.type === "cancel" ? "Ακυρώθηκε" : "Αποτυχία σύνδεσης",
      };
    }

    // Parse the returned URL to get the authorization code
    const returnedUrl = new URL(result.url);
    const code = returnedUrl.searchParams.get("code");
    const returnedState = returnedUrl.searchParams.get("state");

    if (!code) {
      const error = returnedUrl.searchParams.get("error");
      return {
        success: false,
        error: error || "Δεν ελήφθη authorization code",
      };
    }

    if (returnedState !== state) {
      return { success: false, error: "State mismatch - ασφάλεια" };
    }

    // Exchange authorization code for tokens
    const tokenResponse = await AuthSession.exchangeCodeAsync(
      {
        clientId: GOOGLE_WEB_CLIENT_ID,
        clientSecret: GOOGLE_WEB_CLIENT_SECRET,
        code,
        redirectUri: GOOGLE_REDIRECT_URI,
        extraParams: {
          code_verifier: codeVerifier,
        },
      },
      discovery,
    );

    if (!tokenResponse.accessToken) {
      return { success: false, error: "Δεν ελήφθη access token" };
    }

    // Get the email of the connected account
    const userInfo = await fetchGoogleUserInfo(tokenResponse.accessToken);
    const connectedEmail = userInfo?.email || "Άγνωστο email";

    // Store tokens in Firestore team document
    const driveConfig: DriveConfig = {
      refreshToken: tokenResponse.refreshToken || "",
      accessToken: tokenResponse.accessToken,
      tokenExpiry: Date.now() + (tokenResponse.expiresIn || 3600) * 1000,
      connectedEmail,
      connectedAt: new Date().toISOString(),
      rootFolderId: "", // Will be set on first sync
    };

    await updateDoc(doc(db, "teams", teamId), {
      driveConfig,
    });

    console.log("Drive connected for team:", teamId, "email:", connectedEmail);
    return { success: true };
  } catch (error: any) {
    console.error("Drive connect error:", error);
    return {
      success: false,
      error: error.message || "Σφάλμα σύνδεσης Google Drive",
    };
  }
};

/**
 * Disconnect Google Drive for a team
 * Revokes the token and clears config from Firestore
 */
export const disconnectGoogleDrive = async (teamId: string): Promise<void> => {
  try {
    const teamDoc = await getDoc(doc(db, "teams", teamId));
    const config = teamDoc.data()?.driveConfig as DriveConfig | undefined;

    // Revoke the token if we have one
    if (config?.refreshToken) {
      try {
        await AuthSession.revokeAsync(
          { token: config.refreshToken },
          discovery,
        );
      } catch (e) {
        console.log("Token revocation failed (may already be revoked):", e);
      }
    }

    // Clear config from Firestore
    await updateDoc(doc(db, "teams", teamId), {
      driveConfig: null,
    });

    console.log("Drive disconnected for team:", teamId);
  } catch (error) {
    console.error("Drive disconnect error:", error);
    throw error;
  }
};

/**
 * Get a valid access token for Drive API calls
 * Auto-refreshes if expired using the stored refresh token
 */
export const getValidAccessToken = async (
  teamId: string,
): Promise<string | null> => {
  try {
    const teamDoc = await getDoc(doc(db, "teams", teamId));
    const config = teamDoc.data()?.driveConfig as DriveConfig | undefined;

    if (!config?.refreshToken) return null;

    // Check if current token is still valid (with 5-minute buffer)
    if (config.accessToken && config.tokenExpiry > Date.now() + 300_000) {
      return config.accessToken;
    }

    // Token expired - refresh it
    const refreshed = await AuthSession.refreshAsync(
      {
        clientId: GOOGLE_WEB_CLIENT_ID,
        clientSecret: GOOGLE_WEB_CLIENT_SECRET,
        refreshToken: config.refreshToken,
      },
      discovery,
    );

    if (!refreshed.accessToken) {
      console.error("Token refresh returned no access token");
      return null;
    }

    // Save new access token to Firestore
    await updateDoc(doc(db, "teams", teamId), {
      "driveConfig.accessToken": refreshed.accessToken,
      "driveConfig.tokenExpiry":
        Date.now() + (refreshed.expiresIn || 3600) * 1000,
    });

    return refreshed.accessToken;
  } catch (error: any) {
    console.error("Token refresh failed:", error);

    // If refresh fails completely, clear the drive config
    if (
      error.message?.includes("invalid_grant") ||
      error.message?.includes("Token has been revoked")
    ) {
      console.log("Refresh token invalid, clearing drive config");
      await updateDoc(doc(db, "teams", teamId), {
        driveConfig: null,
      });
    }

    return null;
  }
};

/**
 * Check if Drive is connected for a team
 */
export const isDriveConnected = (teamData: any): boolean => {
  return !!(
    teamData?.driveConfig?.refreshToken && teamData?.driveConfig?.connectedEmail
  );
};

/**
 * Fetch the Google account's email using the access token
 */
const fetchGoogleUserInfo = async (
  accessToken: string,
): Promise<{ email: string } | null> => {
  try {
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};
