export default function OriginLeadLink({ leadId }: { leadId: number }) {
  return <a href={`/leads/${leadId}`}>Origin Lead</a>;
}

