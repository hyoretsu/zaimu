import type { RecurrenceInput } from "./recurrence";

export interface RecurringSaveRecovery<TDraft = unknown, TSplit = unknown> {
	addPast: boolean;
	completedWrite: boolean;
	debtEnabled: boolean;
	debtSplit: TSplit;
	draft: TDraft;
	input: RecurrenceInput;
	savedId?: string;
}

interface RecurrenceSavePort {
	create: (input: RecurrenceInput) => Promise<{ id: string }>;
	replay: (id: string, from: string, to: string) => Promise<unknown>;
	update: (id: string, input: RecurrenceInput) => Promise<{ id: string }>;
}

export async function saveRecurrenceWithReplay(
	recovery: RecurringSaveRecovery,
	recurrenceId: string | undefined,
	service: RecurrenceSavePort,
	today: string,
): Promise<void> {
	if (!recovery.completedWrite) {
		const saved = recurrenceId
			? await service.update(recurrenceId, recovery.input)
			: await service.create(recovery.input);
		recovery.savedId = saved.id;
		recovery.completedWrite = true;
	}
	if (recovery.addPast && recovery.input.startDate < today)
		await service.replay(recovery.savedId!, recovery.input.startDate, today);
}
