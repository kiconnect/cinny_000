type Member = { matrix_user_id: string; display_name: string };

export function suggestTeamRequestTopic(
  senderName: string,
  recipientIds: string[],
  members: Member[],
  group?: 'arzt' | 'team'
): string {
  if (!senderName.trim() || recipientIds.length === 0) return '';
  const recipients = group
    ? { arzt: 'Ärzteteam', team: 'Team' }[group]
    : [...new Set(recipientIds)]
        .map((id) => members.find((member) => member.matrix_user_id === id)?.display_name.trim() || id)
        .join(', ');
  return `${senderName.trim()} – ${recipients}`;
}
