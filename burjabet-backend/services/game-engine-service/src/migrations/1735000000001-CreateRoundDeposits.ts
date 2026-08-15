import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateRoundDeposits1735000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'round_deposits',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'round_id', type: 'uuid', isNullable: false },
          {
            name: 'amount',
            type: 'decimal',
            precision: 18,
            scale: 9,
            isNullable: false,
          },
          { name: 'signature', type: 'varchar', length: '255', isNullable: false },
          { name: 'created_at', type: 'timestamp', default: 'now()', isNullable: false },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'round_deposits',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'round_deposits',
      new TableForeignKey({
        columnNames: ['round_id'],
        referencedTableName: 'game_rounds',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'round_deposits',
      new TableIndex({ name: 'IDX_round_deposits_round_id', columnNames: ['round_id'] }),
    );
    await queryRunner.createIndex(
      'round_deposits',
      new TableIndex({ name: 'IDX_round_deposits_user_id', columnNames: ['user_id'] }),
    );
    await queryRunner.createIndex(
      'round_deposits',
      new TableIndex({ name: 'UQ_round_deposits_signature', columnNames: ['signature'], isUnique: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('round_deposits', true);
  }


  
}


