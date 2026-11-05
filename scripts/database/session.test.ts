import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { databaseSchema, withAuthenticatedTransaction } from "../../src/lib/db/session";
import { customers, vehicleMakes } from "../../src/lib/db/schema";

test(
  "Drizzle applies branch RLS and clears identity on commit and rollback",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const client = postgres(process.env.TEST_DATABASE_URL!, { max: 1, prepare: false });
    const db = drizzle(client, { schema: databaseSchema });
    const user = randomUUID();
    const otherUser = randomUUID();
    const branch = randomUUID();
    const otherBranch = randomUUID();
    const role = randomUUID();
    const permission = randomUUID();
    const prefix = `drizzle-${randomUUID()}`;
    const customer = randomUUID();
    const hiddenCustomer = randomUUID();
    const claims = { sub: user, role: "authenticated" as const };
    try {
      await client.begin(async (tx) => {
        await tx`insert into public.branches (id, name, code, emirate, address_line_1, city)
        values (${branch}, ${prefix}, ${prefix}, 'dubai', 'Test', 'Dubai'),
               (${otherBranch}, ${prefix + "-other"}, ${prefix + "-other"}, 'dubai', 'Test', 'Dubai')`;
        await tx`insert into auth.users (id, email) values (${user}, ${prefix + "@example.com"}), (${otherUser}, ${prefix + "-other@example.com"})`;
        await tx`update public.profiles set status = 'active', branch_id = ${branch} where id = ${user}`;
        await tx`insert into public.roles (id, key, name) values (${role}, ${prefix}, 'Drizzle test')`;
        await tx`insert into public.permissions (id, key, name, module) values (${permission}, 'customer.view', 'View customers', 'customer') on conflict (key) do nothing`;
        await tx`insert into public.role_permissions (role_id, permission_id) select ${role}, id from public.permissions where key = 'customer.view'`;
        await tx`insert into public.user_roles (user_id, role_id, branch_id) values (${user}, ${role}, ${branch})`;
        await tx`insert into public.customers (id, customer_code, first_name, last_name, display_name, branch_id, phone)
        values (${customer}, ${prefix}, 'Test', 'Customer', ${prefix}, ${branch}, ${prefix}), (${hiddenCustomer}, ${prefix + "-other"}, 'Other', 'Customer', ${prefix + "-other"}, ${otherBranch}, ${prefix + "-other"})`;
      });
      await withAuthenticatedTransaction(db, claims, async (tx) => {
        const rows = await tx.select({ id: customers.id }).from(customers);
        assert.ok(rows.some((row) => row.id === customer));
        assert.ok(!rows.some((row) => row.id === hiddenCustomer));
        const [context] = await tx.execute(sql`select current_user as role, auth.uid() as id`);
        assert.equal(context.role, "authenticated");
        assert.equal(context.id, user);
        const related = await tx.query.customers.findFirst({
          where: eq(customers.id, customer),
          with: { branch: true },
        });
        assert.equal(related?.branch?.id, branch);
      });
      const assertCleared = async () => {
        const [context] = await client`select current_user as role, auth.uid() as id`;
        assert.notEqual(context.role, "authenticated");
        assert.equal(context.id, null);
      };
      await assertCleared();
      await assert.rejects(
        withAuthenticatedTransaction(db, claims, (tx) =>
          tx.insert(vehicleMakes).values({ name: prefix, slug: prefix }),
        ),
        /Failed query/,
      );
      await assertCleared();
      const invited = await withAuthenticatedTransaction(
        db,
        { sub: otherUser, role: "authenticated" },
        (tx) => tx.select().from(customers),
      );
      assert.deepEqual(invited, []);
    } finally {
      await client`delete from public.customers where id in (${customer}, ${hiddenCustomer})`;
      await client`delete from public.roles where id = ${role}`;
      await client`delete from public.permissions where id = ${permission}`;
      await client`delete from auth.users where id in (${user}, ${otherUser})`;
      await client`delete from public.branches where id in (${branch}, ${otherBranch})`;
      await client.end();
    }
  },
);
