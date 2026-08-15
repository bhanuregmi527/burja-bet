import { MigrationInterface, QueryRunner, TableColumn, TableIndex, Table, TableForeignKey } from 'typeorm';

export class AddUserProfileFields1734177700000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add username column
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'username',
        type: 'varchar',
        length: '50',
        isUnique: true,
        isNullable: true,
      }),
    );

    // Add fullname column
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'fullname',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
    );

    // Add invite_code column
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'invite_code',
        type: 'varchar',
        length: '20',
        isUnique: true,
        isNullable: true,
      }),
    );

    // Add profile_picture column
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'profile_picture',
        type: 'text',
        isNullable: true,
      }),
    );

    // Add burja_points column
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'burja_points',
        type: 'integer',
        default: 0,
      }),
    );

    // Add updated_at column
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'updated_at',
        type: 'timestamp',
        default: 'now()',
        isNullable: false,
      }),
    );

    // Create twitter_accounts table
    await queryRunner.createTable(
      new Table({
        name: 'twitter_accounts',
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
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'twitter_id',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'display_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create foreign key
    await queryRunner.createForeignKey(
      'twitter_accounts',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    // Create indexes
    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'IDX_users_username',
        columnNames: ['username'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'IDX_users_invite_code',
        columnNames: ['invite_code'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('users', 'IDX_users_invite_code');
    await queryRunner.dropIndex('users', 'IDX_users_username');
    await queryRunner.dropTable('twitter_accounts', true);
    await queryRunner.dropColumn('users', 'updated_at');
    await queryRunner.dropColumn('users', 'burja_points');
    await queryRunner.dropColumn('users', 'profile_picture');
    await queryRunner.dropColumn('users', 'invite_code');
    await queryRunner.dropColumn('users', 'fullname');
    await queryRunner.dropColumn('users', 'username');
  }
}

