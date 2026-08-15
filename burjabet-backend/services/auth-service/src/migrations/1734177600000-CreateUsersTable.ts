import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateUsersTable1734177600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure uuid-ossp extension exists for uuid_generate_v4()
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'wallet_address',
            type: 'varchar',
            length: '44',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'balance_sol',
            type: 'decimal',
            precision: 18,
            scale: 9,
            default: '0.000000000',
            isNullable: false,
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

    // TypeORM automatically creates unique index for isUnique: true
    // No need to manually create it to avoid conflicts
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users', true);
  }
}

