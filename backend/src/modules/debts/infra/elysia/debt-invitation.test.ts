import { describe, expect, test } from "bun:test";
import { requirePendingInvitationRecipient } from "./debt-invitation";

describe("invitation preview authorization", () => {
	test("permits the pending recipient", () => {
		expect(() =>
			requirePendingInvitationRecipient({ recipientId: "recipient", status: "PENDING" }, "recipient"),
		).not.toThrow();
	});
	test("rejects sender, unrelated users, resolved and missing invitations", () => {
		for (const userId of ["sender", "unrelated"]) {
			expect(() =>
				requirePendingInvitationRecipient({ recipientId: "recipient", status: "PENDING" }, userId),
			).toThrow("Convite não encontrado");
		}
		for (const status of ["ACCEPTED", "DECLINED"]) {
			expect(() =>
				requirePendingInvitationRecipient({ recipientId: "recipient", status }, "recipient"),
			).toThrow("Convite não encontrado");
		}
		expect(() => requirePendingInvitationRecipient(null, "recipient")).toThrow("Convite não encontrado");
	});
});
