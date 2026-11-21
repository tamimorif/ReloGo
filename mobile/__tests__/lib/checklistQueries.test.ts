import { QueryClient } from "@tanstack/react-query";
import {
  corridorRulesQueryKey,
  fetchCorridorRules,
  prefetchChecklistQueries,
  taskProgressQueryKey,
  taskProgressQueryOptions,
  updateLocalProgress,
} from "../../lib/checklistQueries";
import { supabase } from "../../lib/supabase";
import { loadLocalProgress, saveLocalTaskStatus } from "../../lib/localJourney";

jest.mock("../../lib/supabase", () => ({
  supabase: { rpc: jest.fn() },
}));

jest.mock("../../lib/localJourney", () => ({
  loadLocalProgress: jest.fn(),
  saveLocalTaskStatus: jest.fn(),
}));

const mockRpc = supabase.rpc as jest.Mock;
const mockLoadLocalProgress = loadLocalProgress as jest.Mock;
const mockSaveLocalTaskStatus = saveLocalTaskStatus as jest.Mock;

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("checklist queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps rule and progress cache entries separate by province corridor", () => {
    expect(corridorRulesQueryKey("ON", "BC")).toEqual([
      "corridorRules",
      "ON",
      "BC",
    ]);
    expect(corridorRulesQueryKey("BC", "ON")).not.toEqual(
      corridorRulesQueryKey("ON", "BC"),
    );
    expect(taskProgressQueryKey("ON", "BC")).toEqual([
      "localTaskProgress",
      "ON",
      "BC",
    ]);
    expect(taskProgressQueryKey("BC", "ON")).not.toEqual(
      taskProgressQueryKey("ON", "BC"),
    );
  });

  it("calls the public resolver with the selected province codes", async () => {
    const abortSignal = jest.fn().mockResolvedValue({ data: [], error: null });
    mockRpc.mockReturnValue({ abortSignal });

    await expect(fetchCorridorRules("ON", "BC")).resolves.toEqual([]);

    expect(mockRpc).toHaveBeenCalledWith("resolve_corridor_rules", {
      p_origin_province: "ON",
      p_dest_province: "BC",
    });
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("surfaces resolver failures to the query layer", async () => {
    const serverError = new Error("unavailable");
    mockRpc.mockReturnValue({
      abortSignal: jest.fn().mockResolvedValue({ data: null, error: serverError }),
    });

    await expect(fetchCorridorRules("ON", "BC")).rejects.toBe(serverError);
  });

  it("loads checkmarks from this device for the selected corridor", async () => {
    const localProgress = { "rule-1": "COMPLETED" };
    mockLoadLocalProgress.mockResolvedValue(localProgress);

    await expect(
      makeQueryClient().fetchQuery(taskProgressQueryOptions("ON", "BC")),
    ).resolves.toEqual(localProgress);

    expect(mockLoadLocalProgress).toHaveBeenCalledWith("ON", "BC");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("does not prefetch until the move has both provinces", async () => {
    await prefetchChecklistQueries(makeQueryClient(), {
      origin: "ON",
      destination: null,
    });

    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockLoadLocalProgress).not.toHaveBeenCalled();
  });

  it("prefetches remote rules and local checkmarks for a complete route", async () => {
    mockRpc.mockReturnValue({
      abortSignal: jest.fn().mockResolvedValue({ data: [], error: null }),
    });
    mockLoadLocalProgress.mockResolvedValue({});
    const client = makeQueryClient();

    await prefetchChecklistQueries(client, { origin: "ON", destination: "BC" });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockLoadLocalProgress).toHaveBeenCalledWith("ON", "BC");
    expect(client.getQueryData(taskProgressQueryKey("ON", "BC"))).toEqual({});
  });

  it("saves task completion locally for the selected corridor", async () => {
    mockSaveLocalTaskStatus.mockResolvedValue(undefined);

    await updateLocalProgress("ON", "BC", "rule-1", "COMPLETED");

    expect(mockSaveLocalTaskStatus).toHaveBeenCalledWith(
      "ON",
      "BC",
      "rule-1",
      "COMPLETED",
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
