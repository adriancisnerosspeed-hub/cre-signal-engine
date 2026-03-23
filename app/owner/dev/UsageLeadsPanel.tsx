"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { OwnerDevStats, OrgDetail, ProfileDetail } from "./OwnerDevDashboard";

type DetailView = "organizations" | "profiles" | null;

export function UsageLeadsPanel({ stats }: { stats: OwnerDevStats }) {
  const [detailView, setDetailView] = useState<DetailView>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Usage and leads</CardTitle>
          <CardDescription>Aggregate counts (service role on the server). Recent leads for quick inspection.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ClickableStat label="Organizations" value={stats.organizationCount} onClick={() => setDetailView("organizations")} />
            <ClickableStat label="Profiles" value={stats.profileCount} onClick={() => setDetailView("profiles")} />
            <Stat label="Deal scans (all time)" value={stats.dealScanCount} />
            <Stat label="Leads" value={stats.leadCount} />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">Recent leads</h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead className="hidden sm:table-cell">Name</TableHead>
                    <TableHead className="hidden md:table-cell">Source</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.recentLeads.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        No leads yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    stats.recentLeads.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="max-w-[200px] truncate font-mono text-xs">{row.email}</TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">{row.name ?? "—"}</TableCell>
                        <TableCell className="hidden md:table-cell">{row.source ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(row.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailView === "organizations"} onOpenChange={(open) => !open && setDetailView(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>All Organizations ({stats.allOrganizations.length})</DialogTitle>
            <DialogDescription>Organizations linked to the SaaS platform.</DialogDescription>
          </DialogHeader>
          <OrganizationsDetail orgs={stats.allOrganizations} />
        </DialogContent>
      </Dialog>

      <Dialog open={detailView === "profiles"} onOpenChange={(open) => !open && setDetailView(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>All Profiles ({stats.allProfiles.length})</DialogTitle>
            <DialogDescription>User profiles linked to the SaaS platform.</DialogDescription>
          </DialogHeader>
          <ProfilesDetail profiles={stats.allProfiles} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function OrganizationsDetail({ orgs }: { orgs: OrgDetail[] }) {
  if (orgs.length === 0) {
    return <p className="text-sm text-muted-foreground">No organizations found.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Billing</TableHead>
            <TableHead>Members</TableHead>
            <TableHead className="hidden sm:table-cell">Creator</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orgs.map((org) => (
            <TableRow key={org.id}>
              <TableCell className="max-w-[160px] truncate font-medium text-xs">
                {org.name}
                {!org.onboarding_completed && (
                  <Badge variant="outline" className="ml-2 text-[10px]">No onboarding</Badge>
                )}
              </TableCell>
              <TableCell>
                <PlanBadge plan={org.plan} />
              </TableCell>
              <TableCell>
                <BillingBadge status={org.billing_status} />
              </TableCell>
              <TableCell className="tabular-nums text-xs">{org.member_count}</TableCell>
              <TableCell className="hidden max-w-[140px] truncate font-mono text-xs text-muted-foreground sm:table-cell">
                {org.creator_email ?? <span className="italic text-yellow-500">No account</span>}
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {new Date(org.created_at).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ProfilesDetail({ profiles }: { profiles: ProfileDetail[] }) {
  if (profiles.length === 0) {
    return <p className="text-sm text-muted-foreground">No profiles found.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Orgs</TableHead>
            <TableHead>Scans Used</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {profiles.map((p) => {
            const isAnonymous = !p.email;
            const hasNoOrg = p.org_count === 0 && !p.current_org_id;
            return (
              <TableRow key={p.id}>
                <TableCell className="max-w-[180px] truncate font-mono text-xs">
                  {isAnonymous ? (
                    <span className="flex items-center gap-1.5">
                      <span className="italic text-yellow-500">No account</span>
                      <Badge variant="outline" className="text-[10px] text-yellow-500 border-yellow-500/40">Anonymous</Badge>
                    </span>
                  ) : (
                    p.email
                  )}
                </TableCell>
                <TableCell>
                  <RoleBadge role={p.role} />
                </TableCell>
                <TableCell className="tabular-nums text-xs">
                  {hasNoOrg ? (
                    <span className="text-yellow-500">0 (unlinked)</span>
                  ) : (
                    p.org_count
                  )}
                </TableCell>
                <TableCell className="tabular-nums text-xs">{p.total_full_scans_used ?? 0}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(p.created_at).toLocaleDateString()}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const variant = plan === "FREE" ? "outline" : plan === "ENTERPRISE" ? "default" : "secondary";
  return <Badge variant={variant} className="text-[10px]">{plan}</Badge>;
}

function BillingBadge({ status }: { status: string }) {
  const variant = status === "active" ? "default" : status === "past_due" ? "destructive" : "outline";
  return <Badge variant={variant} className="text-[10px]">{status}</Badge>;
}

function RoleBadge({ role }: { role: string | null }) {
  if (!role || role === "user") return <span className="text-xs text-muted-foreground">user</span>;
  const variant = role === "platform_admin" ? "default" : "secondary";
  return <Badge variant={variant} className="text-[10px]">{role}</Badge>;
}

function ClickableStat({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-lg border border-border bg-muted/20 px-4 py-3 text-left transition-colors hover:bg-muted/40 hover:border-foreground/20"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">Click to view details</p>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
