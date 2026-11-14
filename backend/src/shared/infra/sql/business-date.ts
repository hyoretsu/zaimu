/** Explicit financial cutoff. SQL now()/timestamps remain operational wall time.
 * Only dedicated benchmark connections set this session-local PostgreSQL option.
 */
export const businessDateSql =
	"COALESCE(NULLIF(current_setting('zaimu.business_date', true), '')::date, CURRENT_DATE)";
