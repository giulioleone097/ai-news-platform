import {
  handlePublicMcpRequest,
  publicMcpMethodNotAllowedResponse,
  publicMcpOptionsResponse,
} from "../http";
import { getPublicEditorialRepositories } from "@atlasnews/adapters/editorial/container";

export async function POST(request: Request) {
  const { articles } = getPublicEditorialRepositories();
  return handlePublicMcpRequest(request, articles);
}

export function GET(request: Request) {
  return publicMcpMethodNotAllowedResponse(request);
}

export function DELETE(request: Request) {
  return publicMcpMethodNotAllowedResponse(request);
}

export function OPTIONS(request: Request) {
  return publicMcpOptionsResponse(request);
}
