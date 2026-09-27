variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "my_ip_cidr" {
  description = "Your public IP in CIDR notation, e.g. 102.216.203.229/32"
  type        = string
}