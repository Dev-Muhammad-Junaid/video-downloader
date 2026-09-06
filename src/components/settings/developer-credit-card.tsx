"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Github, Heart, Sparkles } from "lucide-react";
import { restartOnboarding } from "@/components/onboarding-modal";

const GITHUB_USERNAME = "Dev-Muhammad-Junaid";
const REPO_URL = "https://github.com/Dev-Muhammad-Junaid/video-downloader";

export function DeveloperCreditCard() {
    return (
        <Card>
            <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Heart className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                        <p className="text-sm font-medium">
                            SnapDown is built and maintained by{" "}
                            <a
                                href={`https://github.com/${GITHUB_USERNAME}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                            >
                                @{GITHUB_USERNAME}
                            </a>
                        </p>
                        <p className="text-xs text-muted-foreground">Open source — issues, ideas, and pull requests are welcome.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="sm" className="gap-1.5" onClick={restartOnboarding}>
                        <Sparkles className="w-3.5 h-3.5" />
                        Replay Tour
                    </Button>
                    <a
                        href={`https://github.com/${GITHUB_USERNAME}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
                    >
                        <Github className="w-3.5 h-3.5" />
                        Profile
                    </a>
                    <a
                        href={REPO_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5")}
                    >
                        <Github className="w-3.5 h-3.5" />
                        Contribute
                    </a>
                </div>
            </CardContent>
        </Card>
    );
}
