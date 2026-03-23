"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeatureFlagsPanel } from "./FeatureFlagsPanel";
import { RiskSandboxPanel } from "./RiskSandboxPanel";
import { UsageLeadsPanel } from "./UsageLeadsPanel";
import { TestToolsPanel } from "./TestToolsPanel";
import { AbVariantPanel } from "./AbVariantPanel";
import { TierSetterPanel } from "./TierSetterPanel";
import { DebugPanel } from "./DebugPanel";

export type OrgDetail = {
  id: string;
  name: string;
  plan: string;
  billing_status: string;
  created_at: string;
  created_by: string;
  onboarding_completed: boolean;
  member_count: number;
  creator_email: string | null;
};

export type ProfileDetail = {
  id: string;
  role: string | null;
  current_org_id: string | null;
  total_full_scans_used: number | null;
  created_at: string;
  email: string | null;
  org_count: number;
};

export type OwnerDevStats = {
  organizationCount: number;
  leadCount: number;
  dealScanCount: number;
  profileCount: number;
  recentLeads: {
    id: string;
    email: string;
    name: string | null;
    source: string | null;
    created_at: string;
  }[];
  organizations: { id: string; plan: string; created_at: string }[];
  profileSamples: { id: string; role: string | null; total_full_scans_used: number | null }[];
  allOrganizations: OrgDetail[];
  allProfiles: ProfileDetail[];
};

export function OwnerDevDashboard({ stats, ownerEmail }: { stats: OwnerDevStats; ownerEmail: string }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <p className="text-sm text-muted-foreground">
        Signed in as <span className="font-mono text-foreground">{ownerEmail}</span>. Visible only when{" "}
        <span className="font-mono">OWNER_EMAIL</span> matches your account.
      </p>

      <Tabs defaultValue="flags" className="gap-4">
        <TabsList variant="line" className="flex h-auto min-h-8 w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="flags" className="text-xs sm:text-sm">
            Feature flags
          </TabsTrigger>
          <TabsTrigger value="sandbox" className="text-xs sm:text-sm">
            Risk sandbox
          </TabsTrigger>
          <TabsTrigger value="usage" className="text-xs sm:text-sm">
            Usage & leads
          </TabsTrigger>
          <TabsTrigger value="tests" className="text-xs sm:text-sm">
            Test tools
          </TabsTrigger>
          <TabsTrigger value="ab" className="text-xs sm:text-sm">
            A/B variants
          </TabsTrigger>
          <TabsTrigger value="tier" className="text-xs sm:text-sm">
            Tier override
          </TabsTrigger>
          <TabsTrigger value="debug" className="text-xs sm:text-sm">
            Debug
          </TabsTrigger>
        </TabsList>

        <TabsContent value="flags" className="mt-4">
          <FeatureFlagsPanel />
        </TabsContent>
        <TabsContent value="sandbox" className="mt-4">
          <RiskSandboxPanel />
        </TabsContent>
        <TabsContent value="usage" className="mt-4">
          <UsageLeadsPanel stats={stats} />
        </TabsContent>
        <TabsContent value="tests" className="mt-4">
          <TestToolsPanel />
        </TabsContent>
        <TabsContent value="ab" className="mt-4">
          <AbVariantPanel />
        </TabsContent>
        <TabsContent value="tier" className="mt-4">
          <TierSetterPanel organizations={stats.organizations} />
        </TabsContent>
        <TabsContent value="debug" className="mt-4">
          <DebugPanel profileSamples={stats.profileSamples} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
