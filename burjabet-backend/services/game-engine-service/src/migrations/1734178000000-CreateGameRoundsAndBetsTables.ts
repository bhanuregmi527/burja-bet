import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class CreateGameRoundsAndBetsTables1734178000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure uuid-ossp extension exists
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // Create GameRoundStatus enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "game_round_status_enum" AS ENUM('OPEN', 'CLOSED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create BetStatus enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "bet_status_enum" AS ENUM('PENDING', 'WON', 'LOST');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create game_rounds table
    await queryRunner.createTable(
      new Table({
        name: 'game_rounds',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'result',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enumName: 'game_round_status_enum',
            default: "'OPEN'",
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create bets table
    await queryRunner.createTable(
      new Table({
        name: 'bets',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'round_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 18,
            scale: 9,
            isNullable: false,
          },
          {
            name: 'symbol',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enumName: 'bet_status_enum',
            default: "'PENDING'",
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create foreign keys
    await queryRunner.createForeignKey(
      'bets',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'bets',
      new TableForeignKey({
        columnNames: ['round_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'game_rounds',
        onDelete: 'CASCADE',
      }),
    );

    // Create indexes
    await queryRunner.createIndex(
      'bets',
      new TableIndex({
        name: 'IDX_bets_round_id',
        columnNames: ['round_id'],
      }),
    );

    await queryRunner.createIndex(
      'bets',
      new TableIndex({
        name: 'IDX_bets_user_id',
        columnNames: ['user_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('bets', 'IDX_bets_user_id');
    await queryRunner.dropIndex('bets', 'IDX_bets_round_id');

    // Drop foreign keys
    await queryRunner.query('ALTER TABLE "bets" DROP CONSTRAINT IF EXISTS "FK_bets_round_id"');
    await queryRunner.query('ALTER TABLE "bets" DROP CONSTRAINT IF EXISTS "FK_bets_user_id"');

    // Drop tables
    await queryRunner.dropTable('bets', true);
    await queryRunner.dropTable('game_rounds', true);

    // Drop enums
    await queryRunner.query('DROP TYPE IF EXISTS "bet_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "game_round_status_enum"');
  }
}

