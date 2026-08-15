import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPreparedStatusAndDepositSignature1735000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add 'PREPARED' to bet_status_enum
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "bet_status_enum" ADD VALUE IF NOT EXISTS 'PREPARED';
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add deposit_signature column to bets table
    await queryRunner.addColumn(
      'bets',
      new TableColumn({
        name: 'deposit_signature',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove deposit_signature column
    await queryRunner.dropColumn('bets', 'deposit_signature');

    // Note: PostgreSQL doesn't support removing enum values directly
    // You would need to recreate the enum without 'PREPARED' if you need to revert
    // This is a complex operation and typically not recommended in production
    // For now, we'll leave the enum value in place
  }
}

