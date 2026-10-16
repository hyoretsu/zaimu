import { HttpException } from "~/shared/errors";
import type { MonthlyBudgetBody } from "../infra/MonthlyBudgetsDTO";

export function validateMonthlyBudgetFields(body: MonthlyBudgetBody) {
	if (body.source !== "UNCATEGORIZED" && !(body.amount != null && body.amount > 0))
		throw new HttpException("Informe um valor planejado maior que zero", 400);
	if (body.endMonth && body.endMonth < body.startMonth)
		throw new HttpException("Mês final anterior ao inicial", 400);
	if ((body.source === "TAG") !== Boolean(body.categoryId))
		throw new HttpException("Selecione uma tag somente para planejamento por tag", 400);
}
