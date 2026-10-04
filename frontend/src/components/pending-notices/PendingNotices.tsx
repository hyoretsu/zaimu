import { PendingCreditCardImportsNotice } from "@/components/credit-card-imports";
import { PendingDebtInvitations } from "@/components/debt-invitations";
import { PendingPaymentSuggestions } from "@/components/payment-suggestions";
import { PendingTransactionImportsNotice } from "@/components/transaction-imports";

interface PendingNoticesProps {
	onReviewTransactionImport?: (importId: string) => void;
	onReviewCreditCardImport?: (importId: string) => void;
	debtInvitations?: boolean;
	paymentSuggestions?: boolean;
}

export function PendingNotices({
	onReviewTransactionImport,
	onReviewCreditCardImport,
	debtInvitations = false,
	paymentSuggestions = false,
}: PendingNoticesProps) {
	return (
		<>
			{onReviewTransactionImport && <PendingTransactionImportsNotice onReview={onReviewTransactionImport} />}
			{onReviewCreditCardImport && <PendingCreditCardImportsNotice onReview={onReviewCreditCardImport} />}
			{debtInvitations && <PendingDebtInvitations />}
			{paymentSuggestions && <PendingPaymentSuggestions />}
		</>
	);
}
