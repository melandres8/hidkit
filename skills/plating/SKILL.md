---
name: plating
description: Use this skill for every prose file or message Hidkit writes, such as replies, docs, PR text, commit messages, skills, recipes, and roles, in English or Spanish.
---
# Plating

Plating is the writing standard of Hidkit. Follow it for every prose file or message, in English or Spanish.

## Both languages

- Use the active voice.
- Write each instruction in the imperative.
- Give each word one meaning. Do not swap synonyms for variety.
- Use the approved terms in [GLOSSARY.md](../../GLOSSARY.md). Never use a synonym that the glossary rejects.
- In Spanish, use the English glossary term unless its entry has an `**Español:**` line.
- Keep each sentence within the limit of its text type.

## English

English follows the ASD-STE100 rules, as the list above and the next sections state them.

## Text types

The path of a file, or the kind of message, sets its text type. Do not add manual markers.

| Type | Where | Sentence limit |
|---|---|---|
| Procedural | Files under `skills/` and `agents/` | 20 words |
| Descriptive | Every other file, PR text, commit messages, and the chat reply | 25 words |

- In procedural text, write one instruction per sentence.
- In descriptive text, keep causal connectors such as "because", "unless", and "so".
- Do not split one cause and one effect into two fragments. The reader loses the link between them.
- Completeness beats brevity. Never drop content to make text short.
- Keep every section that the recipe requires in the reply.

## Keywords

Use RFC 2119 keywords in capitals to separate a constraint from a preference.

- English: MUST, MUST NOT, SHOULD, SHOULD NOT, MAY.
- Spanish: DEBE, NO DEBE, DEBERÍA, NO DEBERÍA, PUEDE.
- When a sentence states a constraint or a preference, use the capitalized keyword.
- Otherwise rephrase the sentence so that it needs no keyword.
- The ordinary words "may" and "puede" are allowed when they state a possibility.
- These keywords are not in the Hidkit set: `SHALL`, `REQUIRED`, `RECOMMENDED`, `OPTIONAL`.

## Banned words

Never use these words in English or Spanish. The linter fails on each of them.

```text
simply, just, basically, obviously, clearly, leverage, utilize, seamless, seamlessly,
robust, various, etc., simplemente, básicamente, obviamente, claramente
```

## Spanish

Apply these rules in this order of priority.

1. Español Técnico Simplificado (ETS). Adapt its writing rules. Do not adopt its full vocabulary. Use these Spanish rules:
   - Start an instruction with a verb in the imperative or the infinitive.
   - Name the actor. Avoid the passive and the impersonal `se` when they hide who acts.
   - Put the subject before the verb.
   - Write one idea per sentence.
   - Use at most one subordinate clause in a sentence. Keep the causal clause.
2. RFC 2119 keywords, as the Keywords section lists them.
3. UNE-ISO 24495-1:2024 for documents that people read. Each text MUST meet four criteria:
   - Relevant: it gives the reader the information that the reader needs.
   - Findable: the reader locates that information fast, through headings and order.
   - Understandable: the reader grasps the meaning at the first reading.
   - Usable: the reader can act on the text without more help.
4. ISO 704:2022 for definitions. Define each term in one sentence. Name the genus, then the differentia, for one concept.

## Reply

The Reply section of [Cheffy](../cheffy/SKILL.md#reply) sets the layout of the chat reply. The eval Judge measures the reply. The pass table and the check ids stay in the ledger, so a reply without them is complete.

## Lint

Cheffy runs the prose check as gate 9 of [the pass](../cheffy/pass.md). For each finding:

- Fix every error.
- Fix every warning, unless the shorter sentence loses meaning.
- Report each warning that you keep.

## License note

Hidkit paraphrases the rules of ASD-STE100, ETS, and UNE-ISO. It keeps its own vocabulary in `GLOSSARY.md`. Do not copy text from those standards.
