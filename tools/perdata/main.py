# main.py (V1.3 - 名称冲突修复版)

import typer
from typing_extensions import Annotated
import logging
from rich.console import Console
from rich.logging import RichHandler

# ------------------- [A] 配置日志 -------------------
logging.basicConfig(
    level="INFO",
    format="%(message)s",
    datefmt="[%X]",
    handlers=[RichHandler(rich_tracebacks=True, markup=True)],
)
log = logging.getLogger("rich")
console = Console()
# ---------------------------------------------------


# ------------------- [B] 导入工作流 (使用别名) -------------------
try:
    from src.workflows import generate_questions as gq_workflow
    from src.workflows import build_knowledge_graph as bkg_workflow
    from src.workflows import process_pdfs as pp_workflow
    from src.workflows import import_github_graph as igg_workflow
except ImportError as e:
    log.error("[bold red]错误: 无法导入工作流模块。[/bold red]")
    log.error("请确保您已从项目根目录运行此脚本，并且 'src' 目录存在。")
    log.error(f"详细错误: {e}")
    raise typer.Exit(code=1)
# -----------------------------------------------------------------


# ------------------- [C] 创建 Typer 应用实例 -------------------
app = typer.Typer(
    name="Content Generation Engine",
    help="""
    [bold green]奥赛生物智能学习伴侣 - 内容生成引擎 CLI[/bold green]
    
    这是一个离线工具，用于为线上平台生成和注入基础数据。
    """,
)
# -----------------------------------------------------------------


# ------------------- [D] 定义命令行命令 -------------------


@app.command()
def generate_questions(
    start_page: Annotated[int, typer.Option(help="要为其生成题目的起始页码。", rich_help_panel="Required")],
    end_page: Annotated[int, typer.Option(help="要为其生成题目的结束页码。", rich_help_panel="Required")],
    force: Annotated[bool, typer.Option("--force", help="强制重新生成题目，即使该页面的题目已存在。", rich_help_panel="Customization")] = False,
):
    """
    为指定页面范围生成练习题，并直接写入生产 D1 数据库。
    
    此命令会自动从 D1 获取页面内容，调用 AI 生成题目，然后直接将结果写入 'Questions' 表。
    默认会跳过已存在问题的页面。
    """
    if start_page > end_page:
        log.error(
            f"[bold red]错误: 起始页码 ({start_page}) 不能大于结束页码 ({end_page})。[/bold red]"
        )
        raise typer.Exit(code=1)

    console.print(
        f"\n[bold cyan]🚀 开始为页面范围 [yellow]{start_page}-{end_page}[/yellow] 生成题目并写入 D1...[/bold cyan]"
    )
    if force:
        console.print("[yellow]⚠️ 已启用强制模式，将为所有页面重新生成题目。[/yellow]")

    try:
        gq_workflow.run(start_page=start_page, end_page=end_page, force=force)

        console.print("\n[bold green]✅ 批量任务完成！[/bold green]")
        console.print(
            "请检查控制台日志了解详情。"
        )
    except Exception as e:
        log.error("\n[bold red]❌ 在批量生成题目时发生严重错误。[/bold red]")
        raise e



@app.command()
def build_graph(
    start_page: Annotated[int, typer.Option(help="要为其生成知识图谱的起始页码。")],
    end_page: Annotated[int, typer.Option(help="要为其生成知识图谱的结束页码。")],
    force: Annotated[bool, typer.Option("--force", help="强制重新处理所有页面，即时它们之前已成功处理过。")] = False,
):
    """
    为指定的页面范围生成知识图谱，并注入到 Neo4j 数据库。

    此命令具有幂等性，会跳过之前已成功处理的页面。
    使用 --force 选项可以强制重新处理所有页面。
    """
    if start_page > end_page:
        log.error(f"[bold red]错误: 起始页码 ({start_page}) 不能大于结束页码 ({end_page})。[/bold red]")
        raise typer.Exit(code=1)

    console.print(
        f"\n[bold cyan]🚀 开始为页面范围 [yellow]{start_page}-{end_page}[/yellow] 构建知识图谱...[/bold cyan]"
    )
    if force:
        console.print("[yellow]⚠️ 已启用强制模式，将重新处理所有页面。[/yellow]")

    try:
        bkg_workflow.run(start_page=start_page, end_page=end_page, force=force)

        console.print("\n[bold green]✅ 知识图谱构建任务完成！[/bold green]")
        console.print(
            "请检查日志了解详情，并可查看 [cyan]output/graph_build_status.json[/cyan] 文件确认已处理的页面。"
        )
    except Exception as e:
        log.error(f"\n[bold red]❌ 在构建知识图谱时发生严重错误。[/bold red]")
        log.error(f"详细错误: {e}")
        raise typer.Exit(code=1)






@app.command()
def process_pdfs(
    force: Annotated[bool, typer.Option("--force", help="强制重新处理所有页面，即使它们已经存在于远程数据库中。", rich_help_panel="Customization")] = False,
):
    """
    处理 'pdfs' 目录中的所有 PDF 文件。

    此工作流会调用 Gemini API 将每个 PDF 的内容提取为 Markdown，
    然后将结果直接存储在远程 Cloudflare D1 数据库的 'PageContent' 表中。
    默认情况下，它会自动跳过数据库中已经存在的页面。
    """
    console.print("\n[bold cyan]🚀 开始处理 PDF 文件并直接写入远程 D1 数据库...[/bold cyan]")
    console.print("这个过程可能需要很长时间，具体取决于 PDF 的数量。")
    console.print("详细日志将输出到 [cyan]output/pdf_processing.log[/cyan]")

    if force:
        console.print("[yellow]⚠️ 已启用强制模式，将重新处理所有页面。[/yellow]")
    
    try:
        pp_workflow.process_all_pdfs(force=force)
        console.print("\n[bold green]✅ PDF 内容提取任务完成！[/bold green]")
        console.print("所有内容都已成功提取并存储在远程 D1 数据库中。")
    except Exception as e:
        log.error("\n[bold red]❌ 在处理 PDF 时发生严重错误。[/bold red]")
        log.error(f"详细错误: {e}")
        raise typer.Exit(code=1)


@app.command()
def import_graph_d1(
    force: Annotated[bool, typer.Option("--force", help="强制重新导入并替换 D1 数据库中的图谱节点与边。")] = False,
):
    """
    全量导入/同步 GitHub 知识图谱 (3,212 节点, 12,090 边) 到 Cloudflare D1 数据库。
    """
    console.print("\n[bold cyan]🚀 开始将 GitHub 知识图谱分块全量注入到远程 Cloudflare D1 数据库...[/bold cyan]")
    try:
        igg_workflow.run(force=force)
        console.print("\n[bold green]✅ 知识图谱 D1 全量迁移任务成功完成！[/bold green]")
    except Exception as e:
        log.error("\n[bold red]❌ 在导入知识图谱到 D1 时发生严重错误。[/bold red]")
        log.error(f"详细错误: {e}")
        raise typer.Exit(code=1)




# --------------------------------------------------------------------



# ------------------- [E] 运行 Typer 应用 -------------------
if __name__ == "__main__":
    app()
# -----------------------------------------------------------------
