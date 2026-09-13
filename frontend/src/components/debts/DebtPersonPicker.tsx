import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuChevronDown, LuLink, LuPlus, LuUserRound, LuUsersRound } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { dataService } from "@/lib/dataService";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";

export function DebtPersonPicker({
	disabled,
	excludedIds = [],
	onValueChange,
	required,
	selectionOnly = false,
	value,
}: {
	disabled?: boolean;
	excludedIds?: string[];
	onValueChange: (personId: string) => void;
	required?: boolean;
	selectionOnly?: boolean;
	value?: string;
}) {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [open, setOpen] = useState(false);
	const [inviteOpen, setInviteOpen] = useState(false);
	const [search, setSearch] = useDebouncedInput("", () => undefined);
	const [email, setEmail] = useDebouncedInput("", () => undefined);
	const ledger = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.debts.getLedger(),
		queryKey: queryKeys.debts.ledger(identity!),
	});
	const people = ledger.data?.people ?? [];
	const selected = people.find(person => person.id === value);
	const availablePeople = people.filter(person => person.id === value || !excludedIds.includes(person.id));
	const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
	const filtered = availablePeople.filter(person =>
		person.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch),
	);
	const exact = people.find(person => person.name.toLocaleLowerCase("pt-BR") === normalizedSearch);
	const createPerson = useMutation({
		mutationFn: (name: string) => dataService.debts.createPerson(name),
		onError: error => showToast(error instanceof Error ? error.message : "Pessoa não criada.", "negative"),
		onSuccess: async person => {
			await invalidateCacheOperation(queryClient, identity!, "debt");
			onValueChange(person.id);
			setSearch("");
			setOpen(false);
			showToast(`Pessoa “${person.name}” adicionada.`, "positive");
		},
	});
	const invite = useMutation({
		mutationFn: () => dataService.debts.invitePerson(value!, email.trim()),
		onError: error => showToast(error instanceof Error ? error.message : "Convite não enviado.", "negative"),
		onSuccess: async () => {
			await invalidateCacheOperation(queryClient, identity!, "invitation");
			setEmail("");
			setInviteOpen(false);
			showToast("Convite enviado.", "positive");
		},
	});
	const choose = (personId: string) => {
		if (personId !== value && excludedIds.includes(personId)) {
			showToast("Essa pessoa já participa do rateio.", "negative");
			return;
		}
		onValueChange(personId);
		setSearch("");
		setOpen(false);
	};
	const createOrSelect = () => {
		if (!search.trim()) return;
		if (exact) choose(exact.id);
		else createPerson.mutate(search.trim());
	};

	return (
		<div className="grid min-w-0 max-w-full gap-2">
			<p className="font-medium text-sm">
				Pessoa {required ? <span className="text-destructive">*</span> : null}
			</p>
			<Popover onOpenChange={setOpen} open={open}>
				<PopoverTrigger asChild>
					<Button
						aria-label="Selecionar pessoa da dívida"
						className="h-auto min-h-10 w-full min-w-0 max-w-full cursor-pointer justify-between rounded-2xl px-3 py-2 font-normal"
						disabled={disabled}
						type="button"
						variant="outline"
					>
						<span className="flex min-w-0 flex-1 items-center gap-2">
							{selected?.isZaimuUser ? (
								<LuUsersRound className="shrink-0" />
							) : (
								<LuUserRound className="shrink-0" />
							)}
							<span className={selected ? "min-w-0 truncate" : "min-w-0 truncate text-muted-foreground"}>
								{selected?.name ?? "Selecione uma pessoa"}
							</span>
						</span>
						<LuChevronDown className="shrink-0 text-muted-foreground" />
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-(--radix-popover-trigger-width) min-w-72 gap-3 p-3"
					portal={false}
				>
					<div className="flex gap-2">
						<Input
							autoComplete="name"
							name="debt-person-search"
							onChange={event => setSearch(event.currentTarget.value)}
							onKeyDown={event => {
								if (event.key !== "Enter") return;
								event.preventDefault();
								createOrSelect();
							}}
							placeholder="Ex: Ana Souza"
							type="text"
							value={search}
						/>
						<Button
							aria-label={exact ? "Selecionar pessoa" : "Adicionar pessoa"}
							className="cursor-pointer"
							disabled={!search.trim() || createPerson.isPending}
							onClick={createOrSelect}
							size="icon"
							type="button"
						>
							<LuPlus />
						</Button>
					</div>
					<ScrollArea className="h-48 pr-3">
						{ledger.isPending ? (
							<div className="grid gap-2">
								{[1, 2, 3].map(item => (
									<Skeleton className="h-10" key={item} />
								))}
							</div>
						) : (
							<div className="grid gap-1">
								{filtered.map(person => (
									<Button
										className="cursor-pointer justify-start font-normal"
										key={person.id}
										onClick={() => choose(person.id)}
										type="button"
										variant={value === person.id ? "secondary" : "outline"}
									>
										{person.isZaimuUser ? <LuUsersRound /> : <LuUserRound />}
										<span className="truncate">{person.name}</span>
										{person.isZaimuUser ? (
											<span className="ml-auto text-muted-foreground text-xs">Zaimu</span>
										) : null}
									</Button>
								))}
							</div>
						)}
					</ScrollArea>
				</PopoverContent>
			</Popover>
			{!selectionOnly ? (
				selected && !selected.isZaimuUser && selected.connectionStatus !== "PENDING" ? (
					inviteOpen ? (
						<div className="flex gap-2 rounded-2xl border p-2">
							<Input
								autoComplete="email"
								name="debt-person-email"
								onChange={event => setEmail(event.currentTarget.value)}
								placeholder="pessoa@exemplo.com"
								type="email"
								value={email}
							/>
							<Button
								className="cursor-pointer"
								disabled={!email.trim() || invite.isPending}
								onClick={() => invite.mutate()}
								type="button"
							>
								Enviar
							</Button>
						</div>
					) : (
						<Button
							className="cursor-pointer justify-start"
							onClick={() => setInviteOpen(true)}
							type="button"
							variant="outline"
						>
							<LuLink /> Associar conta Zaimu
						</Button>
					)
				) : selected?.connectionStatus === "PENDING" ? (
					<p className="text-muted-foreground text-xs">Convite Zaimu pendente.</p>
				) : null
			) : null}
		</div>
	);
}
