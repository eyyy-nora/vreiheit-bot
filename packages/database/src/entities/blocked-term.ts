import { Server } from "src/entities/server";
import { ServerMember } from "src/entities/server-member";
import { regexp } from "src/transformers";
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("blocked-term")
export class BlockedTerm {
  @PrimaryGeneratedColumn("increment")
  id!: number;

  @Column("varchar", {
    transformer: regexp("i"),
  })
  pattern!: RegExp;

  @Column("varchar", { default: "general" })
  tags!: string;

  @Column("varchar", { default: "warn" })
  action!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => ServerMember, ({ blockedTerms }) => blockedTerms)
  author!: ServerMember;

  @ManyToOne(() => Server, ({ blockedTerms }) => blockedTerms)
  guild!: Server;
}
