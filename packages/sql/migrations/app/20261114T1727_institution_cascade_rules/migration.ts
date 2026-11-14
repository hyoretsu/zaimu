#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/5d5688852636b4777d80e49996e4cd867d1ea7daf4ce452a882f76fbe697c696/contract';
import endContract from '../../snapshots/5d5688852636b4777d80e49996e4cd867d1ea7daf4ce452a882f76fbe697c696/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/71b2dfe9c496fe5a475bbc2fa00ed04f8c171ee25bdd1c29986d04f6bfe38641/contract';
import startContract from '../../snapshots/71b2dfe9c496fe5a475bbc2fa00ed04f8c171ee25bdd1c29986d04f6bfe38641/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropConstraint({
        schema: 'public',
        table: 'CurrencyCountryAssociation',
        constraint: 'CurrencyCountryAssociation_countryCode_fkey',
        kind: 'foreignKey',
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'FinancialAccount',
        constraint: 'FinancialAccount_institutionId_fkey',
        kind: 'foreignKey',
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'FinancialInstitutionProfile',
        constraint: 'FinancialInstitutionProfile_institutionId_fkey',
        kind: 'foreignKey',
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'FinancialInstitutionProposal',
        constraint: 'FinancialInstitutionProposal_authorId_fkey',
        kind: 'foreignKey',
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'FinancialInstitutionProposal',
        constraint: 'FinancialInstitutionProposal_institutionId_fkey',
        kind: 'foreignKey',
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'FinancialInstitutionProposal',
        constraint: 'FinancialInstitutionProposal_reviewerId_fkey',
        kind: 'foreignKey',
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'FinancialInstitutionYieldPolicy',
        constraint: 'FinancialInstitutionYieldPolicy_profileId_fkey',
        kind: 'foreignKey',
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'InstitutionReviewAudit',
        constraint: 'InstitutionReviewAudit_proposalId_fkey',
        kind: 'foreignKey',
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'InstitutionReviewAudit',
        constraint: 'InstitutionReviewAudit_reviewerId_fkey',
        kind: 'foreignKey',
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'UserFinancialInstitution',
        constraint: 'UserFinancialInstitution_institutionId_fkey',
        kind: 'foreignKey',
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'UserInstitutionProfileChange',
        constraint: 'UserInstitutionProfileChange_profileId_fkey',
        kind: 'foreignKey',
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'YieldCalendarCoverage',
        constraint: 'YieldCalendarCoverage_countryCode_fkey',
        kind: 'foreignKey',
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'YieldCalendarOverride',
        constraint: 'YieldCalendarOverride_countryCode_fkey',
        kind: 'foreignKey',
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'taxDefinitionVersion',
        constraint: 'taxDefinitionVersion_taxDefinitionId_fkey',
        kind: 'foreignKey',
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'CurrencyCountryAssociation',
        foreignKey: {
          name: 'CurrencyCountryAssociation_countryCode_fkey',
          columns: ['countryCode'],
          references: { schema: 'public', table: 'YieldCalendarCountry', columns: ['code'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'FinancialAccount',
        foreignKey: {
          name: 'FinancialAccount_institutionId_fkey',
          columns: ['institutionId'],
          references: { schema: 'public', table: 'FinancialInstitution', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'FinancialInstitutionProfile',
        foreignKey: {
          name: 'FinancialInstitutionProfile_institutionId_fkey',
          columns: ['institutionId'],
          references: { schema: 'public', table: 'FinancialInstitution', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'FinancialInstitutionProposal',
        foreignKey: {
          name: 'FinancialInstitutionProposal_authorId_fkey',
          columns: ['authorId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'FinancialInstitutionProposal',
        foreignKey: {
          name: 'FinancialInstitutionProposal_institutionId_fkey',
          columns: ['institutionId'],
          references: { schema: 'public', table: 'FinancialInstitution', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'FinancialInstitutionProposal',
        foreignKey: {
          name: 'FinancialInstitutionProposal_reviewerId_fkey',
          columns: ['reviewerId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'FinancialInstitutionYieldPolicy',
        foreignKey: {
          name: 'FinancialInstitutionYieldPolicy_profileId_fkey',
          columns: ['profileId'],
          references: { schema: 'public', table: 'FinancialInstitutionProfile', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'InstitutionReviewAudit',
        foreignKey: {
          name: 'InstitutionReviewAudit_proposalId_fkey',
          columns: ['proposalId'],
          references: { schema: 'public', table: 'FinancialInstitutionProposal', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'InstitutionReviewAudit',
        foreignKey: {
          name: 'InstitutionReviewAudit_reviewerId_fkey',
          columns: ['reviewerId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'UserFinancialInstitution',
        foreignKey: {
          name: 'UserFinancialInstitution_institutionId_fkey',
          columns: ['institutionId'],
          references: { schema: 'public', table: 'FinancialInstitution', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'UserInstitutionProfileChange',
        foreignKey: {
          name: 'UserInstitutionProfileChange_profileId_fkey',
          columns: ['profileId'],
          references: { schema: 'public', table: 'FinancialInstitutionProfile', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'YieldCalendarCoverage',
        foreignKey: {
          name: 'YieldCalendarCoverage_countryCode_fkey',
          columns: ['countryCode'],
          references: { schema: 'public', table: 'YieldCalendarCountry', columns: ['code'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'YieldCalendarOverride',
        foreignKey: {
          name: 'YieldCalendarOverride_countryCode_fkey',
          columns: ['countryCode'],
          references: { schema: 'public', table: 'YieldCalendarCountry', columns: ['code'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'taxDefinitionVersion',
        foreignKey: {
          name: 'taxDefinitionVersion_taxDefinitionId_fkey',
          columns: ['taxDefinitionId'],
          references: { schema: 'public', table: 'taxDefinition', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
