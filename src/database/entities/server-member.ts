import { BlockedTerm } from "src/database/entities/blocked-term";
import { Server } from "src/database/entities/server";
import { SupportTicket } from "src/database/entities/support-ticket";
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

@Entity("member")
@Unique("discordId_server", ["discordId", "guild"])
export class ServerMember {
  @PrimaryGeneratedColumn("uuid")
  uuid!: string;

  @Column("varchar")
  discordId!: string;

  @Column("varchar")
  username!: string;

  @Column("varchar")
  discriminator!: string;

  @Column("varchar", { nullable: true })
  pronouns?: string;

  @Column("boolean", { default: false })
  rulesAccepted!: boolean;

  @Column("varchar", { nullable: true })
  avatarUrl?: string | null;

  @Column("varchar", { nullable: true })
  hierarchyRole?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column("boolean", { default: false })
  maySpeak!: boolean;

  @Column("boolean", { default: false })
  reminded!: boolean;

  @Column("timestamp", { nullable: true })
  leftAt?: Date | null;

  @Column("boolean", { default: false })
  suspect!: boolean;

  @OneToMany(() => BlockedTerm, ({ author }) => author)
  blockedTerms!: BlockedTerm[];

  @ManyToOne(() => Server, ({ members }) => members)
  guild!: Server;

  @OneToMany(() => SupportTicket, ({ author }) => author)
  tickets!: SupportTicket[];

  @OneToMany(() => SupportTicket, ({ assigned }) => assigned)
  assignedTickets!: SupportTicket[];
}
