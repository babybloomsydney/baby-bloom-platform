import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const levelRows = [
  { value: 0, label: "Signed Up", description: "Account created, profile not yet completed" },
  { value: 1, label: "Registered", description: "Profile completed, verification not yet attempted" },
  { value: 2, label: "ID Verified", description: "Passport and selfie confirmed (by AI or admin)" },
  { value: 3, label: "Provisionally Verified", description: "WWCC auto-check passed; visible to parents but cannot accept engagements; manual WWCC check pending silently" },
  { value: 4, label: "Fully Verified", description: "WWCC manually confirmed by admin; full platform access" },
];

const statusRows = [
  { value: 0, label: "Not Started", group: "Pre-verification", description: "Nanny has not submitted the verification form" },
  { value: 10, label: "Pending ID Auto", group: "ID stage", description: "Verification form submitted; AI is checking passport and selfie" },
  { value: 11, label: "Pending ID Review", group: "ID stage", description: "AI flagged issues; ID is in admin manual review queue" },
  { value: 12, label: "ID Rejected", group: "ID stage", description: "Admin rejected ID; nanny must resubmit passport and selfie" },
  { value: 20, label: "Pending WWCC Auto", group: "WWCC stage", description: "ID verified; nanny has NOT yet attempted WWCC verification" },
  { value: 29, label: "WWCC Submitted", group: "WWCC stage", description: "Nanny has uploaded WWCC documents and clicked verify; awaiting AI processing" },
  { value: 25, label: "WWCC Processing", group: "WWCC stage", description: "AI is actively processing the WWCC documents" },
  { value: 21, label: "Pending WWCC Review", group: "WWCC stage", description: "WWCC auto-check failed; WWCC is in admin manual review queue" },
  { value: 22, label: "WWCC Rejected", group: "WWCC stage", description: "Admin rejected WWCC; nanny must resubmit WWCC documents" },
  { value: 23, label: "WWCC Expired", group: "WWCC stage", description: "OCG confirmed expired or auto-detected by cron; nanny must renew" },
  { value: 24, label: "WWCC Document Failed", group: "WWCC stage", description: "Uploaded document could not be read or parsed (e.g. wrong file type)" },
  { value: 26, label: "WWCC OCG Not Found", group: "WWCC stage", description: "OCG has no record of this WWCC number + surname + DOB combination" },
  { value: 27, label: "WWCC Closed", group: "WWCC stage", description: "OCG says the WWCC application was closed; nanny must reapply" },
  { value: 28, label: "WWCC Application Pending", group: "WWCC stage", description: "OCG says WWCC application is still in progress; not yet decided" },
  { value: 30, label: "Provisionally Verified", group: "Verified", description: "WWCC auto-check passed; nanny appears verified; OCG confirmation pending silently" },
  { value: 40, label: "Fully Verified", group: "Verified", description: "OCG CLEARED — both ID and WWCC confirmed; full platform access" },
];

const accessMatrix = [
  { check: "Has completed profile", query: ">= 1", levels: [false, true, true, true, true] },
  { check: "ID is confirmed", query: ">= 2", levels: [false, false, true, true, true] },
  { check: "Visible in search / matching", query: ">= 3", levels: [false, false, false, true, true] },
  { check: "Can accept interview requests", query: ">= 4", levels: [false, false, false, false, true] },
  { check: "Can accept babysitting", query: ">= 4 AND babysitter_eligible", levels: [false, false, false, false, true] },
];

const transitions = [
  { from: "0", event: "Nanny submits verification form", to: "10", levelChange: "1 → 1" },
  { from: "10", event: "AI passes ID check", to: "20", levelChange: "1 → 2" },
  { from: "10", event: "AI fails / flags ID check", to: "11", levelChange: "1 → 1" },
  { from: "11", event: "Admin verifies ID", to: "20", levelChange: "1 → 2" },
  { from: "11", event: "Admin rejects ID", to: "12", levelChange: "1 → 1" },
  { from: "12", event: "Nanny resubmits passport + selfie", to: "10", levelChange: "1 → 1" },
  { from: "20", event: "Nanny uploads WWCC documents and clicks verify", to: "29", levelChange: "2 → 2" },
  { from: "29", event: "AI picks up WWCC for processing", to: "25", levelChange: "2 → 2" },
  { from: "25", event: "WWCC auto-check passes", to: "30", levelChange: "2 → 3" },
  { from: "25", event: "WWCC auto-check fails", to: "21", levelChange: "2 → 2" },
  { from: "25", event: "WWCC document unreadable / wrong file", to: "24", levelChange: "2 → 2" },
  { from: "25", event: "OCG returns 'not found'", to: "26", levelChange: "2 → 2" },
  { from: "25", event: "OCG returns 'closed'", to: "27", levelChange: "2 → 2" },
  { from: "25", event: "OCG returns 'application pending'", to: "28", levelChange: "2 → 2" },
  { from: "21", event: "Admin confirms WWCC", to: "40", levelChange: "2 → 4" },
  { from: "21", event: "Admin rejects WWCC", to: "22", levelChange: "2 → 2" },
  { from: "22", event: "Nanny resubmits WWCC documents", to: "29", levelChange: "2 → 2" },
  { from: "23", event: "Nanny submits renewed WWCC", to: "29", levelChange: "2 → 2" },
  { from: "24", event: "Nanny re-uploads correct document", to: "29", levelChange: "2 → 2" },
  { from: "26", event: "Nanny resubmits with corrected details", to: "29", levelChange: "2 → 2" },
  { from: "27", event: "Nanny reapplies and resubmits WWCC", to: "29", levelChange: "2 → 2" },
  { from: "28", event: "Nanny retries after OCG approves application", to: "29", levelChange: "2 → 2" },
  { from: "30", event: "Admin confirms WWCC (OCG CLEARED)", to: "40", levelChange: "3 → 4" },
  { from: "30", event: "Admin rejects WWCC", to: "22", levelChange: "3 → 2" },
  { from: "40", event: "WWCC expiry date reached (cron)", to: "23", levelChange: "4 → 2" },
];

const syncRows = [
  { level: 0, statuses: "— (no verification record)" },
  { level: 1, statuses: "0, 10, 11, 12" },
  { level: 2, statuses: "20, 21, 22, 23, 24, 25, 26, 27, 28, 29" },
  { level: 3, statuses: "30" },
  { level: 4, statuses: "40" },
];

export default function VerificationReferencePage() {
  const cellClass = "px-3 py-2 text-sm border-b border-slate-100";
  const headerClass = "px-3 py-2 text-xs font-semibold text-slate-500 uppercase border-b border-slate-200 bg-slate-50";

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Verification Reference</h1>
        <p className="mt-1 text-slate-500">
          Quick reference for the two verification data systems. See{" "}
          <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">verification-data-systems.md</code>{" "}
          for the full spec.
        </p>
      </div>

      {/* System 1: Verification Level */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            System 1: Verification Level
            <span className="ml-2 text-sm font-normal text-slate-400">nannies.verification_level</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr>
                <th className={headerClass}>Value</th>
                <th className={headerClass}>Label</th>
                <th className={headerClass}>Description</th>
              </tr>
            </thead>
            <tbody>
              {levelRows.map((row) => (
                <tr key={row.value}>
                  <td className={`${cellClass} font-mono font-bold text-violet-600`}>{row.value}</td>
                  <td className={`${cellClass} font-medium`}>{row.label}</td>
                  <td className={`${cellClass} text-slate-600`}>{row.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Access Control Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Access Control Matrix</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr>
                <th className={headerClass}>Check</th>
                <th className={headerClass}>Query</th>
                <th className={`${headerClass} text-center`}>0</th>
                <th className={`${headerClass} text-center`}>1</th>
                <th className={`${headerClass} text-center`}>2</th>
                <th className={`${headerClass} text-center`}>3</th>
                <th className={`${headerClass} text-center`}>4</th>
              </tr>
            </thead>
            <tbody>
              {accessMatrix.map((row) => (
                <tr key={row.check}>
                  <td className={`${cellClass} font-medium`}>{row.check}</td>
                  <td className={`${cellClass} font-mono text-xs text-slate-500`}>{row.query}</td>
                  {row.levels.map((ok, i) => (
                    <td key={i} className={`${cellClass} text-center`}>
                      {ok ? (
                        <span className="text-green-600 font-bold">Y</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* System 2: Verification Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            System 2: Verification Status
            <span className="ml-2 text-sm font-normal text-slate-400">verifications.verification_status</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr>
                <th className={headerClass}>Value</th>
                <th className={headerClass}>Label</th>
                <th className={headerClass}>Group</th>
                <th className={headerClass}>Description</th>
              </tr>
            </thead>
            <tbody>
              {statusRows.map((row) => (
                <tr key={row.value}>
                  <td className={`${cellClass} font-mono font-bold text-violet-600`}>{row.value}</td>
                  <td className={`${cellClass} font-medium`}>{row.label}</td>
                  <td className={`${cellClass} text-slate-500`}>{row.group}</td>
                  <td className={`${cellClass} text-slate-600`}>{row.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* State Transitions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">State Transitions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr>
                <th className={headerClass}>From</th>
                <th className={headerClass}>Event</th>
                <th className={headerClass}>To</th>
                <th className={headerClass}>Level Change</th>
              </tr>
            </thead>
            <tbody>
              {transitions.map((row, i) => (
                <tr key={i}>
                  <td className={`${cellClass} font-mono font-bold text-violet-600`}>{row.from}</td>
                  <td className={`${cellClass} text-slate-600`}>{row.event}</td>
                  <td className={`${cellClass} font-mono font-bold text-violet-600`}>{row.to}</td>
                  <td className={`${cellClass} font-mono text-slate-500`}>{row.levelChange}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Synchronisation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Level ↔ Status Synchronisation</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr>
                <th className={headerClass}>Verification Level</th>
                <th className={headerClass}>Valid Verification Statuses</th>
              </tr>
            </thead>
            <tbody>
              {syncRows.map((row) => (
                <tr key={row.level}>
                  <td className={`${cellClass} font-mono font-bold text-violet-600`}>{row.level}</td>
                  <td className={`${cellClass} font-mono text-slate-600`}>{row.statuses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
