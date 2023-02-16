import { Server } from "src/database/entities/server";
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("managed-message")
export class ManagedMessage {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("varchar")
  content!: string;

  @Column("varchar", { nullable: true })
  tag!: string;

  @Column("varchar", { nullable: true })
  messageId!: string;

  @Column("varchar", { nullable: true })
  channelId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Server, ({ managedMessages }) => managedMessages)
  guild!: Server;
}
