import { Server } from "src/database/entities/server";
import { ServerMember } from "src/database/entities/server-member";
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("support-ticket")
export class SupportTicket {
  @PrimaryGeneratedColumn("increment")
  id!: number;

  @Column("varchar", { default: "other" })
  category!: string;

  @Column("varchar")
  title!: string;

  @Column("varchar", { nullable: true })
  description?: string;

  @Column("varchar", { nullable: true })
  channelId!: string;

  @Column("varchar", { default: "open" })
  status!: string;

  @ManyToOne(() => ServerMember, ({ tickets }) => tickets)
  author!: ServerMember;

  @ManyToOne(() => ServerMember, ({ assignedTickets }) => assignedTickets, {
    nullable: true,
  })
  assigned!: ServerMember;

  @ManyToOne(() => Server, ({ tickets }) => tickets)
  guild!: Server;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column("timestamp", { nullable: true })
  closedAt?: Date;
}
