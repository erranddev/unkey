import { randomUUID } from "crypto";
import { RouteHarness } from "@/pkg/testutil/route-harness";
import { runSharedRoleTests } from "@/pkg/testutil/test_route_roles";
import { schema } from "@unkey/db";
import { newId } from "@unkey/id";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  V1ApisDeleteApiRequest,
  V1ApisDeleteApiResponse,
  registerV1ApisDeleteApi,
} from "./v1_apis_deleteApi";

let h: RouteHarness;
beforeEach(async () => {
  h = new RouteHarness();
  h.useRoutes(registerV1ApisDeleteApi);
  await h.seed();
});
afterEach(async () => {
  await h.teardown();
});
runSharedRoleTests<V1ApisDeleteApiRequest>({
  registerHandler: registerV1ApisDeleteApi,
  prepareRequest: async (rh) => {
    const apiId = newId("api");
    await rh.db.insert(schema.apis).values({
      id: apiId,
      name: randomUUID(),
      workspaceId: rh.resources.userWorkspace.id,
    });
    return {
      method: "POST",
      url: "/v1/apis.deleteApi",
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        apiId,
      },
    };
  },
});

describe("correct roles", () => {
  test.each([
    { name: "legacy", roles: ["*"] },
    { name: "legacy and more", roles: ["*", randomUUID()] },
    { name: "wildcard", roles: ["api.*.delete_api"] },
    { name: "wildcard and more", roles: ["api.*.delete_api", randomUUID()] },
    { name: "specific apiId", roles: [(apiId: string) => `api.${apiId}.delete_api`] },
    {
      name: "specific apiId and more",
      roles: [(apiId: string) => `api.${apiId}.delete_api`, randomUUID()],
    },
  ])("$name", async ({ roles }) => {
    const apiId = newId("api");
    await h.db.insert(schema.apis).values({
      id: apiId,
      name: randomUUID(),
      workspaceId: h.resources.userWorkspace.id,
    });
    const root = await h.createRootKey(
      roles.map((role) => (typeof role === "string" ? role : role(apiId))),
    );

    const res = await h.post<V1ApisDeleteApiRequest, V1ApisDeleteApiResponse>({
      url: "/v1/apis.deleteApi",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${root.key}`,
      },
      body: {
        apiId,
      },
    });
    expect(res.status).toEqual(200);

    const found = await h.db.query.apis.findFirst({
      where: (table, { eq }) => eq(table.id, apiId),
    });
    expect(found).toBeDefined();
  });
});
