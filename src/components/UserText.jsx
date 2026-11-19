// Text that a person typed keeps its own direction.
//
// Player names, group and session names, places and notes are often Hebrew inside an
// English interface. Left alone, the browser lays the whole line out left-to-right and the
// neighbouring numbers and punctuation jump to the wrong side of the Hebrew word
// ("Bid for 2 · נועה blocked"). Three small tools, one per situation:
//
//   <Name>{player.player_name}</Name>
//       A user-given name INSIDE an app sentence or beside other text. Renders <bdi>, which
//       isolates the name so it cannot reorder what is around it. Inline; changes no layout.
//
//   <UserText>{session.location}</UserText>
//   <UserText as="p" className="…">{note.note}</UserText>
//       Free text shown on its own. Sets dir="auto": the text decides its direction from its
//       first strong letter. As an inline element (the default <span>) it only fixes the
//       order; as a block (as="p", "div", "h1"…) a Hebrew text also aligns to the right,
//       which is what a note should do. Inside something that sets `text-left` (a button,
//       a card), add `text-start` to the block so it follows its own direction again.
//
//   <Input {...dirAuto} />   <Textarea {...dirAuto} />
//       Every field a person types free text into, so Hebrew is typed right-to-left.
//       (Not for e-mail, password, code or number fields.)

export const dirAuto = { dir: 'auto' };

export function Name({ children, className, ...props }) {
  return <bdi className={className} {...props}>{children}</bdi>;
}

export function UserText({ as: Tag = 'span', children, className, ...props }) {
  return <Tag dir="auto" className={className} {...props}>{children}</Tag>;
}

export default UserText;
