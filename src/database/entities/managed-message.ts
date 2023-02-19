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

  @Column("varchar", { nullable: true })
  content!: string;

  @Column("varchar", { nullable: true })
  tag!: string;

  @Column("varchar", { nullable: true })
  messageId!: string;

  @Column("varchar", { nullable: true })
  channelId!: string;

  @Column("varchar", { default: "content" })
  type!: "content" | "embed";

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Server, ({ managedMessages }) => managedMessages)
  guild!: Server;
}
