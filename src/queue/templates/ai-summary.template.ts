export interface AiSummaryData {
  authorityName: string;
  tdrNumber: string;
  location: string;
  tenderValue: string;
  emd: string;
  tenderFee: string;
  submissionDate: string;
  contractPeriod: string;
  workDescription: string;
  scopeOfWork: string[];
  keyDates: { label: string; value: string }[];
  locationAndContact: { label: string; value: string }[];
  basicDetail: { label: string; value: string }[];
  finance: { label: string; value: string }[];
  technicalQualification: string[];
  exemptions: string[];
  documentList: string[];
  boqItems?: { slNo: string; description: string; unit: string; quantity: string; rate?: string; amount?: string }[];
}

export const generateAiSummaryHtml = (data: AiSummaryData) => {
  const currentDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const boqItems: NonNullable<AiSummaryData['boqItems']> = data.boqItems ?? [];
  const hasRate   = boqItems.some(i => i.rate);
  const hasAmount = boqItems.some(i => i.amount);

  const renderTable = (rows: { label: string; value: string }[]) => `
    <table>
      ${rows.map(row => `
        <tr>
          <td class="td-label">${row.label}</td>
          <td class="td-value">${row.value}</td>
        </tr>
      `).join('')}
    </table>`;

  const renderBulletList = (items: string[], color = '#16a34a') => `
    <ul class="bullet-list">
      ${items.map(item => `<li style="--bullet-color: ${color};">${item}</li>`).join('')}
    </ul>`;

  const renderNumberedList = (items: string[]) => `
    <ul class="numbered-list">
      ${items.map((item, i) => `
        <li>
          <div class="number-circle">${i + 1}</div>
          <div class="list-text">${item}</div>
        </li>
      `).join('')}
    </ul>`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
      color: #1e293b;
      background: #fff;
      font-size: 13px;
      line-height: 1.65;
    }

    /* PAGE HEADER */
    .page-header {
      background: linear-gradient(135deg, #0f2060 0%, #1a3a8c 60%, #1e4db7 100%);
      color: white;
      padding: 22px 44px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .logo-area { display: flex; align-items: center; gap: 12px; }
    .logo-icon { width: 40px; height: 40px; background: rgba(255,255,255,0.15); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
    .logo-text { font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
    .logo-sub  { font-size: 9px; letter-spacing: 2.5px; opacity: 0.7; text-transform: uppercase; margin-top: 3px; }
    .header-right { text-align: right; }
    .header-right .doc-title { font-size: 26px; font-weight: 600; color: #93c5fd; line-height: 1.2; }
    .header-right .doc-sub   { font-size: 11px; opacity: 0.8; margin-top: 4px; }

    /* HERO BANNER */
    .hero-banner {
      background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%);
      color: white;
      padding: 24px 44px 20px;
      border-bottom: 4px solid #60a5fa;
    }
    .hero-banner .authority { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
    .hero-banner .meta-row  { display: flex; gap: 24px; font-size: 12px; opacity: 0.85; flex-wrap: wrap; }
    .hero-banner .meta-item { display: flex; align-items: center; gap: 6px; }
    .hero-banner .meta-dot  { width: 6px; height: 6px; background: #93c5fd; border-radius: 50%; flex-shrink: 0; }

    /* KPI STRIP */
    .kpi-strip {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      border: 1px solid #e2e8f0;
      border-top: none;
    }
    .kpi-box { padding: 18px 12px; text-align: center; border-right: 1px solid #e2e8f0; }
    .kpi-box:last-child { border-right: none; }
    .kpi-label { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-weight: 500; }
    .kpi-value { font-size: 14px; font-weight: 700; color: #0f172a; line-height: 1.3; }
    .kpi-value.highlight { color: #d97706; }

    /* MAIN CONTENT */
    .content { padding: 28px 44px 60px; }

    /* SECTION */
    .section { margin-bottom: 26px; page-break-inside: avoid; }
    .section-head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 18px;
      color: white;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      border-radius: 2px 2px 0 0;
    }
    .section-head .icon { width: 16px; height: 16px; opacity: 0.9; flex-shrink: 0; }
    .section-body {
      border: 1px solid #e2e8f0;
      border-top: none;
      border-radius: 0 0 4px 4px;
      overflow: hidden;
    }

    .c-blue   { background: #2563eb; }
    .c-teal   { background: #0d9488; }
    .c-orange { background: #d97706; }
    .c-green  { background: #16a34a; }
    .c-indigo { background: #4f46e5; }
    .c-purple { background: #7c3aed; }
    .c-rose   { background: #e11d48; }

    /* WORK DESCRIPTION */
    .desc-box {
      background: #f0f7ff;
      border: 1px solid #bfdbfe;
      border-top: none;
      padding: 20px 24px;
      font-size: 13.5px;
      line-height: 1.9;
      color: #1e40af;
      border-radius: 0 0 4px 4px;
    }

    /* TABLES */
    table { width: 100%; border-collapse: collapse; }
    tr { border-bottom: 1px solid #e9edf2; }
    tr:last-child { border-bottom: none; }
    tr:nth-child(even) { background: #f8fafc; }
    tr:nth-child(odd)  { background: #ffffff; }
    .td-label {
      padding: 14px 20px;
      font-weight: 600;
      color: #374151;
      width: 32%;
      vertical-align: top;
      border-right: 2px solid #e2e8f0;
    }
    .td-value {
      padding: 14px 20px;
      color: #111827;
      vertical-align: top;
      line-height: 1.7;
    }

    /* BULLET LIST */
    .bullet-list { list-style: none; }
    .bullet-list li {
      position: relative;
      padding: 14px 20px 14px 46px;
      border-bottom: 1px solid #f0f4f8;
      line-height: 1.7;
    }
    .bullet-list li:nth-child(even) { background: #f8fafc; }
    .bullet-list li:nth-child(odd)  { background: #ffffff; }
    .bullet-list li:last-child { border-bottom: none; }
    .bullet-list li::before {
      content: '';
      position: absolute;
      left: 18px;
      top: 20px;
      width: 11px;
      height: 11px;
      background-color: var(--bullet-color, #16a34a);
      border-radius: 50%;
    }

    /* NUMBERED LIST */
    .numbered-list { list-style: none; }
    .numbered-list li {
      display: flex;
      gap: 14px;
      padding: 14px 20px;
      border-bottom: 1px solid #f0f4f8;
      align-items: flex-start;
    }
    .numbered-list li:nth-child(even) { background: #f8fafc; }
    .numbered-list li:nth-child(odd)  { background: #ffffff; }
    .numbered-list li:last-child { border-bottom: none; }
    .number-circle {
      flex-shrink: 0;
      width: 26px; height: 26px;
      background: #2563eb;
      color: white;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 11px;
      margin-top: 1px;
    }
    .list-text { color: #1e293b; line-height: 1.7; }

    /* BOQ TABLE */
    .boq-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .boq-table thead tr { background: #1e293b; }
    .boq-table thead th {
      padding: 12px 14px;
      color: #e2e8f0;
      font-weight: 600;
      text-align: left;
      border-right: 1px solid #334155;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .boq-table thead th:last-child { border-right: none; }
    .boq-odd  { background: #ffffff; }
    .boq-even { background: #f8fafc; }
    .boq-table tbody tr { border-bottom: 1px solid #e9edf2; }
    .boq-table tbody tr:last-child { border-bottom: none; }
    .boq-table tbody td { padding: 11px 14px; vertical-align: top; border-right: 1px solid #f0f4f8; color: #1e293b; }
    .boq-table tbody td:last-child { border-right: none; }
    .boq-sl   { width: 60px; font-weight: 600; color: #64748b; font-size: 11px; white-space: nowrap; }
    .boq-desc { line-height: 1.6; }
    .boq-center { text-align: center; white-space: nowrap; font-size: 12px; }
    .boq-right  { text-align: right; white-space: nowrap; font-weight: 600; color: #0f172a; font-size: 12px; }

    /* FOOTER */
    @page { margin: 0; }
    .page-footer {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      background: #f1f5f9;
      border-top: 2px solid #e2e8f0;
      padding: 8px 44px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9px;
      color: #64748b;
    }
    .page-footer strong { color: #1e40af; }
  </style>
</head>
<body>

  <div class="page-header">
    <div class="logo-area">
      <div class="logo-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
      </div>
      <div>
        <div class="logo-text">TenderLinked</div>
        <div class="logo-sub">Enhancing Business</div>
      </div>
    </div>
    <div class="header-right">
      <div class="doc-title">AI Tender Summary</div>
      <div class="doc-sub">Powered by TenderLinked Intelligence &nbsp;|&nbsp; Generated: ${currentDate}</div>
    </div>
  </div>

  <div class="hero-banner">
    <div class="authority">${data.authorityName || 'Tender Authority'}</div>
    <div class="meta-row">
      <div class="meta-item"><div class="meta-dot"></div> Tender No: ${data.tdrNumber || 'N/A'}</div>
      <div class="meta-item"><div class="meta-dot"></div> Location: ${data.location || 'N/A'}</div>
    </div>
  </div>

  <div class="kpi-strip">
    <div class="kpi-box">
      <div class="kpi-label">Tender Value</div>
      <div class="kpi-value">${data.tenderValue || '-'}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">EMD Amount</div>
      <div class="kpi-value">${data.emd || '-'}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Tender Fee</div>
      <div class="kpi-value">${data.tenderFee || '-'}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Submission Deadline</div>
      <div class="kpi-value highlight">${data.submissionDate || '-'}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Contract Period</div>
      <div class="kpi-value">${data.contractPeriod || '-'}</div>
    </div>
  </div>

  <div class="content">

    <div class="section">
      <div class="section-head c-blue">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Work Description
      </div>
      <div class="desc-box">${data.workDescription || 'No description provided.'}</div>
    </div>

    ${data.scopeOfWork && data.scopeOfWork.length > 0 ? `
    <div class="section">
      <div class="section-head c-green">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        Scope Of Work
      </div>
      <div class="section-body">${renderNumberedList(data.scopeOfWork)}</div>
    </div>
    ` : ''}

    ${data.basicDetail && data.basicDetail.length > 0 ? `
    <div class="section">
      <div class="section-head c-blue">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
        Basic Details
      </div>
      <div class="section-body">${renderTable(data.basicDetail)}</div>
    </div>
    ` : ''}

    ${data.keyDates && data.keyDates.length > 0 ? `
    <div class="section">
      <div class="section-head c-orange">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        Key Dates &amp; Timeline
      </div>
      <div class="section-body">${renderTable(data.keyDates)}</div>
    </div>
    ` : ''}

    ${data.locationAndContact && data.locationAndContact.length > 0 ? `
    <div class="section">
      <div class="section-head c-teal">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        Location &amp; Contact
      </div>
      <div class="section-body">${renderTable(data.locationAndContact)}</div>
    </div>
    ` : ''}

    ${data.finance && data.finance.length > 0 ? `
    <div class="section">
      <div class="section-head c-rose">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        Finance &amp; Payment Terms
      </div>
      <div class="section-body">${renderTable(data.finance)}</div>
    </div>
    ` : ''}

    ${data.technicalQualification && data.technicalQualification.length > 0 ? `
    <div class="section">
      <div class="section-head c-indigo">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Technical Eligibility &amp; Qualification
      </div>
      <div class="section-body">${renderBulletList(data.technicalQualification, '#4f46e5')}</div>
    </div>
    ` : ''}

    ${data.exemptions && data.exemptions.length > 0 ? `
    <div class="section">
      <div class="section-head c-orange">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Exemptions &amp; Special Clauses
      </div>
      <div class="section-body">${renderBulletList(data.exemptions, '#d97706')}</div>
    </div>
    ` : ''}

    ${data.documentList && data.documentList.length > 0 ? `
    <div class="section">
      <div class="section-head c-purple">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
        Required Documents
      </div>
      <div class="section-body">${renderBulletList(data.documentList, '#7c3aed')}</div>
    </div>
    ` : ''}

    ${boqItems.length > 0 ? `
    <div class="section">
      <div class="section-head" style="background: #0f172a;">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        Bill of Quantities (BOQ)
      </div>
      <div class="section-body">
        <table class="boq-table">
          <thead>
            <tr>
              <th>Sl. No.</th>
              <th>Description of Work / Item</th>
              <th>Unit</th>
              <th>Quantity</th>
              ${hasRate   ? '<th>Rate</th>'        : ''}
              ${hasAmount ? '<th>Amount (Rs.)</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${boqItems.map((item, idx) => `
              <tr class="${idx % 2 === 0 ? 'boq-odd' : 'boq-even'}">
                <td class="boq-sl">${item.slNo || (idx + 1)}</td>
                <td class="boq-desc">${item.description || '-'}</td>
                <td class="boq-center">${item.unit || '-'}</td>
                <td class="boq-center">${item.quantity || '-'}</td>
                ${hasRate   ? `<td class="boq-center">${item.rate   || '-'}</td>` : ''}
                ${hasAmount ? `<td class="boq-right">${item.amount  || '-'}</td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

  </div>

  <div class="page-footer">
    <span><strong>TenderLinked</strong> — AI-Powered Tender Intelligence Platform</span>
    <span>Auto-generated. Verify details from the official tender notice before bidding.</span>
    <span>Generated on ${currentDate}</span>
  </div>

</body>
</html>
  `;
};
