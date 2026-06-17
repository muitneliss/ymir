import { remark } from "remark";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";

const processor = remark()
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm);

export async function formatMarkdown(input: string): Promise<string> {
  const file = await processor.process(input);
  return String(file);
}
