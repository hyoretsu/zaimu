-- Local artifact. Apply only through explicitly authorized migration workflow.
BEGIN;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" varchar(10) NOT NULL DEFAULT 'USER';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"user"'::regclass AND conname='user_role_check') THEN ALTER TABLE "user" ADD CONSTRAINT user_role_check CHECK ("role" IN ('USER','ADMIN')); END IF; END $$;
ALTER TABLE "FinancialAccount" ADD COLUMN IF NOT EXISTS "yieldTaxIds" varchar(36)[] NOT NULL DEFAULT ARRAY[]::varchar(36)[];
ALTER TABLE "FinancialAccountYieldRateHistory" ADD COLUMN IF NOT EXISTS "yieldTaxIds" varchar(36)[] NOT NULL DEFAULT ARRAY[]::varchar(36)[];
ALTER TABLE "FinancialInstitutionYieldPolicy" ADD COLUMN IF NOT EXISTS "yieldTaxIds" varchar(36)[] NOT NULL DEFAULT ARRAY[]::varchar(36)[];
CREATE TABLE IF NOT EXISTS "taxDefinition" ("id" varchar(36) PRIMARY KEY,"name" varchar(100) NOT NULL,"isActive" boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS "taxDefinitionVersion" ("id" varchar(36) PRIMARY KEY,"taxDefinitionId" varchar(36) NOT NULL REFERENCES "taxDefinition"("id") ON DELETE RESTRICT,"effectiveDate" date NOT NULL,"applicationOrder" integer NOT NULL,"brackets" json NOT NULL,UNIQUE("taxDefinitionId","effectiveDate"));
INSERT INTO "taxDefinition" ("id","name","isActive") VALUES ('iof','IOF regressivo',true) ON CONFLICT DO NOTHING;
INSERT INTO "taxDefinitionVersion" ("id","taxDefinitionId","effectiveDate","applicationOrder","brackets") VALUES ('iof-initial','iof','0001-01-01',0,'[{"rate":100,"upToDays":0},{"rate":96,"upToDays":1},{"rate":93,"upToDays":2},{"rate":90,"upToDays":3},{"rate":86,"upToDays":4},{"rate":83,"upToDays":5},{"rate":80,"upToDays":6},{"rate":76,"upToDays":7},{"rate":73,"upToDays":8},{"rate":70,"upToDays":9},{"rate":66,"upToDays":10},{"rate":63,"upToDays":11},{"rate":60,"upToDays":12},{"rate":56,"upToDays":13},{"rate":53,"upToDays":14},{"rate":50,"upToDays":15},{"rate":46,"upToDays":16},{"rate":43,"upToDays":17},{"rate":40,"upToDays":18},{"rate":36,"upToDays":19},{"rate":33,"upToDays":20},{"rate":30,"upToDays":21},{"rate":26,"upToDays":22},{"rate":23,"upToDays":23},{"rate":20,"upToDays":24},{"rate":16,"upToDays":25},{"rate":13,"upToDays":26},{"rate":10,"upToDays":27},{"rate":6,"upToDays":28},{"rate":3,"upToDays":29},{"rate":0,"upToDays":null}]'::json) ON CONFLICT DO NOTHING;
INSERT INTO "taxDefinition" ("id","name","isActive") VALUES ('ir','IR regressivo',true) ON CONFLICT DO NOTHING;
INSERT INTO "taxDefinitionVersion" ("id","taxDefinitionId","effectiveDate","applicationOrder","brackets") VALUES ('ir-initial','ir','0001-01-01',1,'[{"upToDays":180,"rate":22.5},{"upToDays":360,"rate":20},{"upToDays":720,"rate":17.5},{"upToDays":null,"rate":15}]'::json) ON CONFLICT DO NOTHING;
COMMIT;
