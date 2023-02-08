import { BlockedTerm } from "src/entities/blocked-term";
import { Poll } from "src/entities/poll";
import { ServerMember } from "src/entities/server-member";
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("guild")
export class Server {
  @PrimaryGeneratedColumn("uuid")
  uuid!: string;

  @Column("varchar", { unique: true })
  discordId!: string;

  @Column("varchar")
  name!: string;

  @Column("varchar", { nullable: true })
  description?: string;

  @Column("varchar", { nullable: true })
  icon?: string;

  @Column("varchar", { nullable: true })
  splash?: string;

  @Column("varchar", { nullable: true })
  modLogChannel?: string;

  @Column("varchar", { nullable: true })
  newComerRoleId?: string;

  @Column("varchar", { nullable: true })
  botRoleId?: string;

  @Column("varchar", { nullable: true })
  speakerRoleId?: string;

  @Column("varchar", { nullable: true })
  veganRoleId?: string;

  @Column("varchar", { nullable: true })
  notVeganRoleId?: string;

  @Column("varchar", { nullable: true })
  hierarchy?: string;

  @Column("varchar", { nullable: true })
  rules?: string;

  @Column("jsonb", { default: {} })
  pronouns!: Record<string, string> & { other: string[] };

  @Column("varchar", { nullable: true })
  rulesChannelId?: string;

  @Column("varchar", { nullable: true })
  rulesChannel?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => BlockedTerm, ({ guild }) => guild)
  blockedTerms!: BlockedTerm[];

  @OneToMany(() => ServerMember, ({ guild }) => guild)
  members!: ServerMember[];

  @OneToMany(() => Poll, ({ guild }) => guild)
  polls!: Poll[];
}
