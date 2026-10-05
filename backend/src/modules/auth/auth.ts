import { betterAuth } from "better-auth/minimal";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email";
import { hashPassword, verifyPassword } from "./password";
import { prismaNextAdapter } from "./prisma-next-adapter";
import { authSecondaryStorage } from "./secondary-storage";

const publicWebUrl = (process.env.PUBLIC_WEB_URL ?? "http://localhost:5173").replace(/\/$/, "");
const apiUrl = (process.env.BETTER_AUTH_URL ?? "http://localhost:3333").replace(/\/$/, "");

export const auth = betterAuth({
	account: { modelName: "AuthAccount" },
	appName: "Zaimu",
	basePath: "/api/auth",
	baseURL: apiUrl,
	database: prismaNextAdapter(),
	emailAndPassword: {
		autoSignIn: false,
		enabled: true,
		minPasswordLength: 8,
		password: {
			hash: hashPassword,
			verify: verifyPassword,
		},
		requireEmailVerification: true,
		resetPasswordTokenExpiresIn: 60 * 60,
		revokeSessionsOnPasswordReset: true,
		sendResetPassword: ({ token, user }) => sendPasswordResetEmail(user.email, token),
	},
	emailVerification: {
		autoSignInAfterVerification: false,
		expiresIn: 60 * 60 * 24,
		sendOnSignIn: true,
		sendOnSignUp: true,
		sendVerificationEmail: ({ token, user }) => sendVerificationEmail(user.email, token),
	},
	rateLimit: {
		// Read-only validation must remain available when Redis cannot fence refreshes.
		customRules: {
			"/get-session": (request, rule) => (request.method === "GET" ? false : rule),
		},
		enabled: true,
		max: 100,
		window: 60,
	},
	secondaryStorage: authSecondaryStorage,
	secret: process.env.BETTER_AUTH_SECRET,
	session: {
		cookieCache: { enabled: false },
		deferSessionRefresh: true,
		modelName: "Session",
		preserveSessionInDatabase: false,
		storeSessionInDatabase: true,
	},
	trustedOrigins: [publicWebUrl, "tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"],
	user: { modelName: "User" },
	verification: { modelName: "Verification", storeInDatabase: true },
});

export type AuthSession = typeof auth.$Infer.Session;
